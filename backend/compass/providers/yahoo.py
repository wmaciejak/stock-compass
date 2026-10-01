"""Unofficial yfinance adapter; availability and data rights are not guaranteed."""

import multiprocessing as mp
import time
import math
from datetime import datetime, timezone, timedelta
import yfinance as yf
from compass.models import Instrument
from compass.normalization import flatten_native, schedule, utcnow
from .base import Bundle, ProviderError, unavailable, FEATURES


def bounded_fetch(call, sleep=time.sleep):
    for attempt in range(2):
        try:
            return call()
        except ProviderError:
            raise
        except Exception as e:
            message = str(e)
            if any(
                x in message.lower() for x in ["429", "rate limit", "too many requests"]
            ):
                raise ProviderError(
                    "Provider rate limited this request. Cached data remain available; wait before refreshing.",
                    "rate_limited",
                ) from e
            if attempt == 1:
                raise ProviderError(f"yfinance unavailable: {message[:250]}") from e
            sleep(1)


def current_session_quote(info, now=None):
    """Separate, timestamped provider-native observation; never an analysis bar."""
    now = now or utcnow()
    try:
        price = float(info["regularMarketPrice"])
        previous = float(info["regularMarketPreviousClose"])
        at = datetime.fromtimestamp(int(info["regularMarketTime"]), timezone.utc)
        if not all(map(math.isfinite, (price, previous))) or min(price, previous) <= 0:
            raise ValueError("Invalid quote values")
        if not timedelta(minutes=-2) <= now - at <= timedelta(minutes=30):
            raise ValueError("Quote is older than 30 minutes or has a future timestamp")
        sessions = schedule((at - timedelta(days=1)).date().isoformat(), at.date().isoformat())
        matching = sessions[(sessions.market_open <= at) & (at <= sessions.market_close)]
        if matching.empty:
            raise ValueError("Quote time is outside a regular US trading session")
        return dict(
            status="available",
            data=dict(
                price=price,
                previous_close=previous,
                change_percent=(price / previous - 1) * 100,
                market_time=at.isoformat(),
                session=matching.index[-1].strftime("%Y-%m-%d"),
                source="Yahoo metadata via yfinance (unofficial)",
                price_basis="provider_native",
                delay="unknown",
            ),
            retrieved_at=now.isoformat(),
        )
    except (KeyError, TypeError, ValueError, OverflowError) as e:
        return unavailable(f"Current-session quote unavailable: {e}.")


def _worker(symbol, pipe, interval="1d"):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.get_info()
        now = utcnow()
        native = ticker.history(
            start=(now - timedelta(days=365 * 6 + 10 if interval == "1d" else 60)).date().isoformat(),
            interval=interval,
            prepost=False,
            auto_adjust=False,
            back_adjust=False,
            repair=False,
            actions=True,
            timeout=12,
            raise_errors=True,
        )
        if native.empty:
            raise ProviderError(
                f"No {interval} price history returned. Check the symbol or try again later.",
                "no_data",
            )
        native = flatten_native(native, symbol)
        news = unavailable(
            "News has not been requested. Load optional context to fetch sourced links."
        )
        pipe.send(("ok", info, native, news))
    except Exception as e:
        pipe.send(("error", str(e)))
    finally:
        pipe.close()


def _download(symbol, interval="1d"):
    # Total provider operation has a hard wall-clock limit, including metadata.
    ctx = mp.get_context("spawn")
    parent, child = ctx.Pipe(duplex=False)
    p = ctx.Process(target=_worker, args=(symbol, child, interval))
    p.start()
    child.close()
    try:
        if not parent.poll(40):
            raise RuntimeError("Provider timed out after 40 seconds.")
        result = parent.recv()
        if result[0] != "ok":
            raise RuntimeError(result[1])
        return result[1:]
    finally:
        parent.close()
        p.join(timeout=0.5)
        if p.is_alive():
            p.terminate()
            p.join(timeout=2)


class YahooProvider:
    name = "yfinance / Yahoo Finance (unofficial)"
    capabilities = {f: True for f in FEATURES}

    def fetch_hourly(self, symbol):
        return self.fetch(symbol, interval="1h")

    def fetch(self, symbol, interval="1d"):
        info, native, news = bounded_fetch(lambda: _download(symbol) if interval == "1d" else _download(symbol, interval))
        name = info.get("longName") or info.get("shortName")
        exchange = info.get("exchange")
        currency = info.get("currency")
        kind = info.get("quoteType")
        if (
            not name
            or exchange
            not in [
                "NMS",
                "NGM",
                "NCM",
                "NYQ",
                "ASE",
                "PCX",
                "BTS",
                "NAS",
                "NYSE",
                "NASDAQ",
            ]
            or currency != "USD"
            or kind not in ["EQUITY", "ETF"]
        ):
            raise ProviderError(
                "Cannot verify a supported US-listed USD stock, ADR or ETF from provider metadata.",
                "unsupported_instrument",
            )
        instrument = Instrument(
            symbol=symbol,
            name=name,
            exchange=exchange,
            currency=currency,
            instrument_type=kind,
            timezone=info.get("exchangeTimezoneName", "America/New_York"),
        )
        fundamental = {
            k: info.get(k)
            for k in [
                "sector",
                "industry",
                "marketCap",
                "trailingPE",
                "forwardPE",
                "revenueGrowth",
                "earningsGrowth",
            ]
        }
        stamp = utcnow().isoformat()
        from compass.events import provider_earnings
        earnings = provider_earnings(info, info.get('exchangeTimezoneName'), stamp)
        return Bundle(
            instrument,
            native,
            "split_dividend_adjusted" if interval == "1d" else "provider_native",
            self.name,
            {
                "quote": current_session_quote(info) if interval == "1d" else unavailable("Hourly bars are separate from current-session quotes."),
                "earnings": earnings,
                "fundamentals": dict(
                    status="available", data=fundamental, retrieved_at=stamp
                ),
                "news": news,
            },
        )

    def unavailable(self, feature):
        return unavailable(f"{feature} unavailable in the provider response.")


def _news_worker(symbol, pipe):
    try:
        articles = []
        for item in yf.Ticker(symbol).get_news(count=8):
            c = item.get("content", item)
            link = (
                c.get("canonicalUrl", {}).get("url")
                or c.get("clickThroughUrl", {}).get("url")
                or c.get("link")
            )
            if link and link.startswith("https://"):
                articles.append(
                    dict(
                        title=c.get("title", "News"),
                        url=link,
                        published_at=c.get("pubDate"),
                        publisher=c.get("provider", {}).get(
                            "displayName", "Yahoo Finance"
                        ),
                    )
                )
        pipe.send(
            dict(
                status="available" if articles else "unavailable",
                data=articles,
                reason=None if articles else "No sourced news returned.",
                retrieved_at=utcnow().isoformat(),
            )
        )
    except Exception as e:
        pipe.send(dict(status="error", reason=str(e)[:200]))
    finally:
        pipe.close()


def fetch_news(symbol):
    ctx = mp.get_context("spawn")
    parent, child = ctx.Pipe(duplex=False)
    p = ctx.Process(target=_news_worker, args=(symbol, child))
    p.start()
    child.close()
    try:
        return (
            parent.recv() if parent.poll(20) else unavailable("News request timed out.")
        )
    finally:
        parent.close()
        p.join(timeout=0.5)
        if p.is_alive():
            p.terminate()
            p.join(timeout=2)
