from datetime import datetime, timezone
import numpy as np
import pandas as pd
import pytest
from compass.normalization import normalize, expected_session, completed_weekly
from compass.indicators import calculate
from compass.rules import decision, causal_zones
from compass.sizing import size_position


def prices(n=300):
    from pandas_market_calendars import get_calendar

    dates = get_calendar("NYSE").schedule("2023-01-03", "2025-12-31").index[:n]
    close = 80 + np.arange(n) * 0.12 + np.sin(np.arange(n) / 9) * 3
    return pd.DataFrame(
        dict(
            Open=close - 0.2,
            High=close + 1,
            Low=close - 1,
            Close=close,
            Volume=np.full(n, 1_000_000.0),
        ),
        index=dates,
    )


def test_talib_reference_and_warmup():
    f = prices()
    f["Close"] = np.arange(1, 301, dtype=float)
    i = calculate(f)
    assert i.sma20.iloc[19] == pytest.approx(10.5)
    assert i.sma200.iloc[:199].isna().all()
    assert i.rsi14.iloc[14] == 100
    assert i.atr14.iloc[:14].isna().all()


def test_flat_short_missing_volume():
    f = prices(15)
    f.loc[:, ["Open", "High", "Low", "Close"]] = 100.0
    f["Volume"] = np.nan
    i = calculate(f)
    assert i.sma50.isna().all()
    assert i.volume_ratio.isna().all()
    assert decision(i, len(i) - 1)["breakout"] == False


def test_no_lookahead_indicators_zones_and_decisions():
    f = prices()
    full = calculate(f)
    short = calculate(f.iloc[:230])
    pd.testing.assert_frame_equal(full.iloc[:230], short)
    assert causal_zones(full, 229) == causal_zones(short, 229)
    assert decision(full, 229) == decision(short, 229)
    assert full.high20.iloc[20] == f.High.iloc[:20].max()


def test_holiday_and_incomplete_week():
    now = datetime(2024, 7, 4, 16, tzinfo=timezone.utc)
    assert expected_session(now) == "2024-07-03"
    f = prices()
    f = f.loc["2023-01-03":"2023-01-05"]
    assert completed_weekly(f, datetime(2023, 1, 5, 23, tzinfo=timezone.utc)).empty


def test_invalid_duplicate_missing_and_unknown_basis():
    f = prices()
    f = pd.concat([f, f.iloc[[5]]])
    f.iloc[0, f.columns.get_loc("High")] = 0
    _, q = normalize(f, "unknown", datetime(2025, 1, 1, tzinfo=timezone.utc))
    assert q["actionable"] is False
    assert any("duplicate" in x.lower() for x in q["issues"])


def test_position_sizing_and_currency():
    result = size_position(10000, "USD", 100, 95, 1, "USD", None, None)
    assert result["shares"] == 20
    assert result["planned_loss"] == 100
    result = size_position(100, "USD", 100, 99, 100, "USD", None, None)
    assert result["shares"] == 1
    with pytest.raises(ValueError):
        size_position(1000, "PLN", 100, 95, 1, "USD", None, None)
