from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from test_core import prices
from compass.normalization import (
    normalize,
    expected_session,
    completed_weekly,
    adjust_native,
)
from compass.indicators import calculate
from compass.rules import decision, causal_zones
from compass.providers.yahoo import bounded_fetch, YahooProvider
from compass.providers.base import ProviderError
from compass.service import ResearchService, encode_frame
from compass.persistence import Store
from compass.analysis import analyze
from compass.models import Instrument
from compass.sizing import size_position


def test_flat_reference_atr_macd_bands_and_ema_initialization():
    f = prices()
    f["Open"] = f["Close"] = 100.0
    f["High"] = 101.0
    f["Low"] = 99.0
    i = calculate(f)
    assert i.atr14.iloc[14] == 2
    assert i.macd.iloc[33] == 0
    assert i.macd_signal.iloc[33] == 0
    assert i.bb_upper.iloc[19] == i.bb_lower.iloc[19] == 100
    f["Close"] = np.arange(1, len(f) + 1, dtype=float)
    assert calculate(f).ema20.iloc[20] == pytest.approx(11.5)


def test_missing_sessions_never_filled_and_volume_unavailable():
    f = prices()
    absent = f.index[150].strftime("%Y-%m-%d")
    f = f.drop(f.index[150])
    f.iloc[-1, f.columns.get_loc("Volume")] = -1
    normalized, q = normalize(f, "split_dividend_adjusted", synthetic=True)
    assert len(normalized) == 299 and absent in q["missing_sessions"]
    assert not q["actionable"] and np.isnan(normalized.Volume.iloc[-1])
    assert np.isnan(calculate(normalized).volume_ratio.iloc[-1])


def test_publication_allowance_early_close_dst_and_completed_holiday_week():
    assert (
        expected_session(datetime(2024, 7, 3, 18, tzinfo=timezone.utc)) == "2024-07-02"
    )
    assert (
        expected_session(datetime(2024, 7, 3, 20, tzinfo=timezone.utc)) == "2024-07-03"
    )
    assert (
        expected_session(datetime(2024, 3, 11, 21, tzinfo=timezone.utc)) == "2024-03-08"
    )
    assert (
        expected_session(datetime(2024, 3, 11, 23, tzinfo=timezone.utc)) == "2024-03-11"
    )
    from pandas_market_calendars import get_calendar

    d = get_calendar("NYSE").schedule("2024-11-25", "2024-11-29").index
    f = pd.DataFrame(
        dict(Open=100.0, High=101.0, Low=99.0, Close=100.0, Volume=1000.0), index=d
    )
    assert (
        len(completed_weekly(f, datetime(2024, 11, 29, 21, tzinfo=timezone.utc))) == 1
    )
    assert completed_weekly(f, datetime(2024, 11, 29, 19, tzinfo=timezone.utc)).empty


def test_provider_two_attempt_limit_for_transient_error():
    calls = []
    sleeps = []

    def failure():
        calls.append(1)
        raise RuntimeError("temporary connection failure")

    with pytest.raises(ProviderError):
        bounded_fetch(failure, sleep=sleeps.append)
    assert len(calls) == 2 and sleeps == [1]


def test_cached_refresh_failure_suppresses_action_without_replacing_native(
    tmp_path, monkeypatch
):
    store = Store(tmp_path / "db.sqlite")
    s = ResearchService(store)
    f = prices()
    f["Adj Close"] = f.Close
    value = dict(
        instrument=Instrument(
            symbol="TEST",
            name="Verified fixture",
            exchange="NYSE",
            currency="USD",
            instrument_type="EQUITY",
        ).model_dump(),
        native=encode_frame(f),
        basis="split_dividend_adjusted",
        source="yfinance / Yahoo Finance (unofficial)",
        context={},
        retrieved_at="2025-01-01T00:00:00+00:00",
    )
    store.cache(s.key("TEST"), value)

    def failure(*args):
        raise ProviderError("429 limited", "rate_limited")

    monkeypatch.setattr(YahooProvider, "fetch", failure)
    _, cached, q, p, _ = s.load("TEST", refresh=True)
    assert not q["actionable"] and p["cache"]
    assert any("Refresh failed" in x for x in q["issues"])
    assert store.cached(s.key("TEST"))["native"] == value["native"]
    # Reopening, summaries and backtests must retain the restriction.
    _, _, q, p, _ = s.load("TEST", allow_download=False)
    assert not q["actionable"] and any("Refresh failed" in x for x in q["issues"])
    before = store.get("failure:TEST")
    s.load("TEST", refresh=True)
    assert store.get("failure:TEST") == before


def test_short_analysis_cannot_issue_action():
    f = prices(55)
    f, q = normalize(f, "split_dividend_adjusted", synthetic=True)
    p = dict(
        source="synthetic test",
        retrieved_at="2025-01-01T00:00:00+00:00",
        last_completed_bar=f.index[-1].strftime("%Y-%m-%d"),
        expected_completed_bar="2025-01-01",
        exchange_timezone="America/New_York",
        price_basis="split_dividend_adjusted",
        synthetic=True,
    )
    a = analyze(
        Instrument(
            symbol="DEMO_SHORT",
            name="Synthetic short",
            exchange="NYSE",
            currency="USD",
            instrument_type="SYNTHETIC",
            synthetic=True,
        ),
        f,
        q,
        p,
        {},
    )
    assert a.metrics["sma200"] is None
    assert (
        a.assessment.label == "Insufficient or stale data"
        and a.assessment.scenario is None
    )


def test_swing_available_only_after_two_right_sessions():
    f = prices(240)
    f.loc[f.index[205], "High"] = 200
    i = calculate(f)
    pivot = f.index[205].strftime("%Y-%m-%d")
    assert not any(z["pivot_date"] == pivot for z in causal_zones(i, 206))
    zones = causal_zones(i, 207)
    assert any(
        z["pivot_date"] == pivot
        and z["available_date"] == f.index[207].strftime("%Y-%m-%d")
        for z in zones
    )


def test_repeated_prefix_invariance():
    f = prices(420)
    full = calculate(f)
    for cut in [201, 255, 333, 400]:
        prefix = calculate(f.iloc[:cut])
        pd.testing.assert_frame_equal(full.iloc[:cut], prefix)
        assert decision(full, cut - 1) == decision(prefix, cut - 1)
        assert causal_zones(full, cut - 1) == causal_zones(prefix, cut - 1)


def test_dated_fx_and_cash_cap():
    r = size_position(1000, "PLN", 100, 90, 1, "USD", 0.25, "2026-09-29")
    assert r["shares"] == 0 and r["remaining_cash"] == 250
    r = size_position(1000, "PLN", 100, 90, 10, "USD", 0.25, "2026-09-29")
    assert r["shares"] == 2 and r["exposure"] == 200 and r["planned_loss"] == 20
    with pytest.raises(ValueError):
        size_position(1000, "USD", 95, 100, 1, "USD")


def test_snapshot_split_restatement_not_false_fifty_percent_drop():
    f = prices()
    f["Close"] = 100.0
    f["Open"] = 100.0
    f["High"] = 101.0
    f["Low"] = 99.0
    f, q = normalize(f, "split_dividend_adjusted", synthetic=True)
    instrument = Instrument(
        symbol="DEMO_SPLIT",
        name="Synthetic split",
        exchange="NYSE",
        currency="USD",
        instrument_type="SYNTHETIC",
        synthetic=True,
    )
    p = dict(
        source="synthetic test",
        retrieved_at="2025-01-01T00:00:00+00:00",
        last_completed_bar=f.index[-1].strftime("%Y-%m-%d"),
        expected_completed_bar="2025-01-01",
        exchange_timezone="America/New_York",
        price_basis="split_dividend_adjusted",
        synthetic=True,
    )
    a = analyze(instrument, f, q, p, {})
    old = a.model_dump()
    old["metrics"]["Close"] = 200.0
    old["provenance"]["last_completed_bar"] = f.index[-2].strftime("%Y-%m-%d")
    result = analyze(
        instrument, f, q, p, {}, previous=dict(analysis=old, created_at="2025-01-01")
    )
    assert any("restat" in x.lower() for x in result.changes)
    assert not any("-50.00%" in x for x in result.changes)
