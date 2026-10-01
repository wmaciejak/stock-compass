"""Session dates are exchange-local date labels, never UTC intraday timestamps."""

from datetime import datetime, timezone, timedelta
from functools import lru_cache
import numpy as np
import pandas as pd
import pandas_market_calendars as mcal

ALLOWANCE = timedelta(hours=2)


def utcnow():
    return datetime.now(timezone.utc)


@lru_cache(maxsize=64)
def schedule(start: str, end: str):
    # US primary listings/ADRs use the common US equity session calendar.
    return mcal.get_calendar("NYSE").schedule(start_date=start, end_date=end)


def expected_session(now=None):
    now = now or utcnow()
    s = schedule((now - timedelta(days=14)).date().isoformat(), now.date().isoformat())
    done = s[s.market_close + ALLOWANCE <= pd.Timestamp(now)]
    return done.index[-1].strftime("%Y-%m-%d")


def flatten_native(raw, symbol):
    f = raw.copy()
    if isinstance(f.columns, pd.MultiIndex):
        for level in range(f.columns.nlevels):
            if symbol in f.columns.get_level_values(level):
                f = f.xs(symbol, axis=1, level=level)
                break
        if isinstance(f.columns, pd.MultiIndex):
            raise ValueError(
                "Unexpected multi-symbol provider response; refusing ambiguous columns."
            )
    return f


def adjust_native(raw):
    f = raw.copy()
    if "Adj Close" not in f:
        raise ValueError(
            "Provider omitted adjusted close; no compatible analysis series."
        )
    factor = pd.to_numeric(f["Adj Close"], errors="coerce") / pd.to_numeric(
        f["Close"], errors="coerce"
    )
    for c in ["Open", "High", "Low", "Close"]:
        f[c] = pd.to_numeric(f[c], errors="coerce") * factor
    # Dividend adjustment NEVER changes volume. Yahoo's native volume is retained.
    return f


def normalize(raw, basis, now=None, synthetic=False):
    now = now or utcnow()
    f = raw.copy()
    issues = []
    critical = False
    required = ["Open", "High", "Low", "Close", "Volume"]
    if any(c not in f for c in required):
        raise ValueError(
            "Required CSV/provider columns: Date, Open, High, Low, Close, Volume."
        )
    dates = pd.to_datetime(f.index, errors="coerce")
    if dates.isna().any():
        raise ValueError("Unparseable session date.")
    # Preserve each exchange-local date, stripping timezone without conversion.
    f.index = pd.DatetimeIndex([pd.Timestamp(x.date()) for x in dates], name="Date")
    if f.index.duplicated().any():
        issues.append(
            "Duplicate sessions removed for inspection; recommendations blocked."
        )
        critical = True
        f = f.loc[~f.index.duplicated(keep="first")]
    if not f.index.is_monotonic_increasing:
        issues.append("Sessions sorted; native order preserved in cache.")
    f = f.sort_index()
    for c in required:
        f[c] = pd.to_numeric(f[c], errors="coerce")
    valid = (
        np.isfinite(f[["Open", "High", "Low", "Close"]]).all(axis=1)
        & (f[["Open", "High", "Low", "Close"]] > 0).all(axis=1)
        & (f.High >= f[["Open", "Close", "Low"]].max(axis=1))
        & (f.Low <= f[["Open", "Close", "High"]].min(axis=1))
    )
    if not valid.all():
        issues.append(
            f"{int((~valid).sum())} invalid OHLC bars excluded; recommendations blocked."
        )
        critical = True
        f = f[valid]
    invalid_volume = (~np.isfinite(f.Volume)) | (f.Volume <= 0)
    if invalid_volume.any():
        issues.append(
            "Missing, nonpositive or invalid volume; affected volume indicators unavailable."
        )
        f.loc[invalid_volume, "Volume"] = np.nan
        if invalid_volume.tail(21).any():
            critical = True
    expected = expected_session(now)
    provisional = 0
    missing = []
    if not f.empty:
        s = schedule(
            f.index[0].strftime("%Y-%m-%d"),
            max(f.index[-1].strftime("%Y-%m-%d"), now.date().isoformat()),
        )
        done = s.index[s.market_close + ALLOWANCE <= pd.Timestamp(now)]
        tradable = f.index.isin(done)
        provisional = int((~tradable).sum())
        if provisional:
            issues.append(f"{provisional} non-session or unfinished bars excluded.")
        non_session = ~f.index.isin(s.index)
        if non_session.any():
            critical = True
            issues.append("Non-trading session dates found.")
        f = f.loc[tradable]
        if not f.empty:
            missing = [
                d.strftime("%Y-%m-%d")
                for d in done[(done >= f.index[0]) & (done <= f.index[-1])]
                if d not in f.index
            ]
            if missing:
                issues.append(
                    f"{len(missing)} missing tradable sessions; candles were not filled."
                )
                critical = True
    stale = f.empty or f.index[-1].strftime("%Y-%m-%d") < expected
    if synthetic:
        stale = False
    if stale:
        issues.append("History does not include the latest expected published session.")
    if basis not in ("split_dividend_adjusted", "split_adjusted"):
        critical = True
        issues.append(
            "Adjustment basis unknown or unadjusted: strategy evaluation blocked until clarified."
        )
    if len(f) < 200:
        issues.append(
            "Fewer than 200 sessions: long-term trend unavailable; research scope reduced."
        )
    return f, dict(
        actionable=not critical and not stale and len(f) >= 200,
        stale=stale,
        issues=issues,
        missing_sessions=missing,
        provisional_bars=provisional,
        bars=len(f),
    )


def completed_weekly(f, now=None):
    if f.empty:
        return f.copy()
    now = now or utcnow()
    rows = []
    first = f.index[0].to_period("W-FRI").start_time.date().isoformat()
    last = f.index[-1].to_period("W-FRI").end_time.date().isoformat()
    all_sessions = schedule(first, last)
    for _, g in f.groupby(f.index.to_period("W-FRI")):
        period = g.index[-1].to_period("W-FRI")
        s = all_sessions.loc[period.start_time : period.end_time]
        if s.empty or s.market_close.iloc[-1] + ALLOWANCE > pd.Timestamp(now):
            continue
        if not s.index.isin(g.index).all():
            continue
        rows.append(
            dict(
                Date=s.index[-1],
                Open=g.Open.iloc[0],
                High=g.High.max(),
                Low=g.Low.min(),
                Close=g.Close.iloc[-1],
                Volume=g.Volume.sum(min_count=len(g)),
            )
        )
    return pd.DataFrame(rows).set_index("Date") if rows else f.iloc[:0].copy()
