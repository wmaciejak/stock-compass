from io import StringIO
import re
from datetime import datetime, timedelta
import pandas as pd
from compass.models import Instrument, Settings
from compass.normalization import normalize, adjust_native, expected_session, utcnow
from compass.providers.demo import DemoProvider
from compass.providers.yahoo import YahooProvider
from compass.providers.csv import CSVProvider
from compass.providers.base import ProviderError, unavailable
from compass.analysis import analyze
from compass.events import cached_event
from compass.beginner import beginner_summary


def symbol_name(symbol):
    s = symbol.upper().strip()
    if not re.fullmatch(r"(?:[A-Z][A-Z0-9.-]{0,14}|DEMO_[A-Z0-9_]{1,12})", s):
        raise ValueError(
            "Use a US ticker, for example MU, TSM, BRK-B, or a supported DEMO_ instrument."
        )
    return s


def encode_frame(f):
    return f.to_json(orient="split", date_format="iso")


def decode_frame(value):
    return pd.read_json(StringIO(value), orient="split")


class ResearchService:
    def __init__(self, store, offline=False):
        self.store = store
        self.offline = offline

    def settings(self):
        saved = self.store.get("settings")
        if saved is not None and "experience" not in saved:
            saved = {**saved, "experience": "advanced"}
        return Settings(**(saved or {}))

    def source(self, symbol):
        return self.store.get(
            "source:" + symbol, "demo" if symbol.startswith("DEMO_") else "yfinance"
        )

    def key(self, symbol):
        convention = self.store.get("basis:" + symbol, "split_dividend_adjusted")
        date_range = self.store.get("range:" + symbol, "6y")
        return f"{self.source(symbol)}:{symbol}:1d:{date_range}:{convention}-v1"

    def save_bundle(self, symbol, bundle):
        value = dict(
            instrument=bundle.instrument.model_dump(),
            native=encode_frame(bundle.native),
            basis=bundle.basis,
            source=bundle.source,
            context=bundle.context,
            retrieved_at=utcnow().isoformat(),
        )
        self.store.cache(self.key(symbol), value)
        return value

    def load(self, symbol, refresh=False, allow_download=True, now=None):
        symbol = symbol_name(symbol)
        key = self.key(symbol)
        cached = self.store.cached(key)
        value = cached
        refresh_error = None
        source = self.source(symbol)
        if (not cached or refresh) and source != "csv" and allow_download:
            try:
                if source == "yfinance" and self.offline:
                    raise ProviderError(
                        "Offline mode: network access disabled. Import CSV or use demo.",
                        "offline",
                    )
                last_failure = self.store.get("failure:" + symbol)
                if (
                    source == "yfinance"
                    and last_failure
                    and utcnow() - datetime.fromisoformat(last_failure["at"])
                    < timedelta(minutes=2)
                ):
                    raise ProviderError(
                        last_failure["message"] + " Retry cooldown is two minutes.",
                        "cooldown",
                    )
                bundle = (
                    DemoProvider() if source == "demo" else YahooProvider()
                ).fetch(symbol)
                value = self.save_bundle(symbol, bundle)
                self.store.set("failure:" + symbol, None)
                self.store.set(
                    "provider_status",
                    dict(status="available", symbol=symbol, at=utcnow().isoformat()),
                ) if source == "yfinance" else None
            except ProviderError as e:
                if e.code != "cooldown":
                    self.store.set(
                        "failure:" + symbol,
                        dict(at=utcnow().isoformat(), message=str(e), code=e.code),
                    )
                if source == "yfinance":
                    self.store.set(
                        "provider_status",
                        dict(
                            status="error",
                            reason=str(e),
                            code=e.code,
                            at=utcnow().isoformat(),
                        ),
                    )
                if not cached:
                    raise
                refresh_error = str(e)
        if not value:
            raise ProviderError(
                "No cached history. Open the stock or refresh to request data.",
                "not_cached",
            )
        native = decode_frame(value["native"])
        adjusted = adjust_native(native) if source == "yfinance" else native
        instrument = Instrument(**value["instrument"])
        f, q = normalize(adjusted, value["basis"], now=now, synthetic=instrument.synthetic)
        # A provider failure remains a provenance restriction on cache reads,
        # even after the retry cooldown expires, until a successful refetch.
        failure = self.store.get("failure:" + symbol)
        if failure and source == "yfinance":
            refresh_error = failure["message"]
        if refresh_error:
            q["issues"].append("Refresh failed; cached data: " + refresh_error)
            q["actionable"] = False
        provenance = dict(
            source=value["source"],
            retrieved_at=value["retrieved_at"],
            last_completed_bar=f.index[-1].strftime("%Y-%m-%d") if len(f) else None,
            expected_completed_bar=expected_session(now),
            exchange_timezone=instrument.timezone,
            price_basis=value["basis"],
            repair_flags=[
                x
                for x in q["issues"]
                if any(k in x.lower() for k in ["removed", "sorted", "excluded"])
            ],
            cache=cached is not None and (not refresh or refresh_error is not None),
            synthetic=instrument.synthetic,
            requested_range=self.store.get(
                "range:" + symbol, "5 years + 1 year warm-up"
            ),
        )
        context = value["context"].copy()
        if refresh_error and "quote" in context:
            context["quote"] = unavailable("Quote refresh failed; earlier quote suppressed.")
        return instrument, f, q, provenance, context

    def analysis(self, symbol, refresh=False, refresh_benchmark=True, allow_download=True, now=None):
        symbol = symbol_name(symbol)
        settings = self.settings()
        options = dict(allow_download=False) if not allow_download else {}
        if now is not None:
            options['now'] = now
        data = self.load(symbol, refresh, **options)
        benchmark_symbol = "DEMO_MARKET" if data[0].synthetic else settings.benchmark
        bench = None
        bench_reason = None
        try:
            b = (
                data if benchmark_symbol == symbol
                else self.load(benchmark_symbol, refresh and refresh_benchmark, **options)
            )
            if b[2]["actionable"] and b[3]["price_basis"] == data[3]["price_basis"]:
                bench = b[1]
            else:
                bench_reason = "Benchmark stale/incomplete or adjustment basis does not match the stock."
        except (ProviderError, ValueError) as e:
            bench_reason = str(e)
        previous = self.store.latest_snapshot(symbol)
        a = analyze(
            *data,
            benchmark=bench,
            benchmark_symbol=benchmark_symbol,
            horizon=settings.horizon,
            previous=previous,
        )
        if bench_reason:
            a.relative["reason"] = bench_reason
        a.earnings = cached_event(self, symbol, now=now)
        a.beginner = beginner_summary(a)
        return a

    def summary(self, symbol):
        try:
            data = self.load(symbol, allow_download=False)
            settings = self.settings()
            benchmark = "DEMO_MARKET" if data[0].synthetic else settings.benchmark
            bench = None
            try:
                b = self.load(benchmark, allow_download=False)
                if b[2]["actionable"] and b[3]["price_basis"] == data[3]["price_basis"]:
                    bench = b[1]
            except (ProviderError, ValueError):
                pass
            a = analyze(
                *data,
                benchmark=bench,
                benchmark_symbol=benchmark,
                horizon=settings.horizon,
                previous=self.store.latest_snapshot(symbol),
            )
            trend = (
                "Bullish"
                if a.assessment.strategy_signals["trend"]
                else "Bearish"
                if a.metrics["sma50"]
                and a.metrics["sma200"]
                and a.metrics["Close"] < min(a.metrics["sma50"], a.metrics["sma200"])
                else "Mixed / weak"
            )
            return dict(
                symbol=symbol,
                instrument=a.instrument.model_dump(),
                status="available",
                close=a.metrics["Close"],
                change=a.metrics["daily_change"],
                quote=(a.context["quote"].data if (
                    not a.instrument.synthetic
                    and a.context.get("quote")
                    and a.context["quote"].status == "available"
                    and a.context["quote"].data["session"] > (a.provenance.last_completed_bar or "")
                    and timedelta(minutes=-2) <= utcnow() - datetime.fromisoformat(a.context["quote"].data["market_time"]) <= timedelta(minutes=30)
                ) else None),
                trend=trend,
                label=a.assessment.label,
                score=a.assessment.score,
                contributions=a.assessment.contributions,
                event_risk=a.assessment.event_risk,
                earnings=cached_event(self, symbol).model_dump(),
                provenance=a.provenance.model_dump(),
                timestamp=a.assessment.timestamp,
                changes=a.changes,
            )
        except (ProviderError, ValueError) as e:
            return dict(symbol=symbol, status="unavailable", reason=str(e), score=-1, earnings=cached_event(self, symbol).model_dump())

    def preview_csv(self, request):
        request.symbol = symbol_name(request.symbol)
        if request.symbol.startswith("DEMO_") and request.price_basis == "unknown":
            pass
        b = CSVProvider().parse(request)
        f, q = normalize(b.native, b.basis, synthetic=b.instrument.synthetic)
        return b, dict(
            instrument=b.instrument.model_dump(),
            quality=q,
            price_basis=b.basis,
            rows=len(b.native),
            first_date=f.index[0].strftime("%Y-%m-%d") if len(f) else None,
            last_date=f.index[-1].strftime("%Y-%m-%d") if len(f) else None,
            preview=[
                dict(
                    Date=d.strftime("%Y-%m-%d"),
                    **{
                        k: (None if pd.isna(v) else float(v))
                        for k, v in r.items()
                        if k in ["Open", "High", "Low", "Close", "Volume"]
                    },
                )
                for d, r in f.tail(5).iterrows()
            ],
            warning="Identity and adjustment convention are user-declared. Unknown or unadjusted basis permits inspection but blocks strategy results.",
        )
