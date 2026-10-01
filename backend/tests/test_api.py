from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from compass.api import create_app
from compass.normalization import adjust_native, normalize, flatten_native
from compass.models import CSVInput


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path / "compass.sqlite", offline=True))


def test_demo_end_to_end_and_journal(client):
    a = client.get("/api/analysis/DEMO_TREND")
    assert a.status_code == 200, a.text
    d = a.json()
    assert d["instrument"]["synthetic"]
    assert d["metrics"]["rsi14"] is not None
    snap = client.post("/api/snapshots/DEMO_TREND").json()["id"]
    idea = client.post(
        "/api/journal",
        json=dict(
            symbol="DEMO_TREND", thesis="Wait for confirmation", analysis_id=snap
        ),
    )
    assert idea.status_code == 200, idea.text
    assert client.get("/api/journal").json()[0]["analysis_id"] == snap
    report = client.get("/api/export/DEMO_TREND")
    assert "SYNTHETIC DEMO" in report.text
    assert "split_dividend_adjusted" in report.text
    backtest = client.post("/api/backtest/DEMO_TREND", json={"strategy": "breakout"})
    assert backtest.status_code == 200, backtest.text
    assert backtest.json()["provenance"]["synthetic"]


def test_real_symbol_never_gets_synthetic_values(client):
    r = client.get("/api/analysis/MU")
    assert r.status_code == 503
    assert "Offline mode" in r.json()["detail"]
    assert client.get("/api/watchlist?mode=live").json()[0]["status"] == "unavailable"


def test_refresh_retrieves_stock_and_benchmark_once_per_batch(client, monkeypatch):
    service = client.app.state.service
    original = service.load
    calls = []

    def observed(symbol, refresh=False, allow_download=True):
        if refresh:
            calls.append(symbol)
        return original(symbol, refresh, allow_download)

    monkeypatch.setattr(service, "load", observed)
    first = client.get("/api/analysis/DEMO_TREND?refresh=true")
    second = client.get(
        "/api/analysis/DEMO_RANGE?refresh=true&refresh_benchmark=false"
    )
    assert first.status_code == second.status_code == 200
    assert calls == ["DEMO_TREND", "DEMO_MARKET", "DEMO_RANGE"]
    assert not first.json()["provenance"]["cache"]
    assert not second.json()["provenance"]["cache"]


def test_refresh_recalculates_prices_percentages_and_watchlist(client, monkeypatch):
    from compass.providers.demo import DemoProvider

    original = DemoProvider.fetch
    before = client.get("/api/analysis/DEMO_TREND").json()

    def changed(self, symbol):
        bundle = original(self, symbol)
        if symbol == "DEMO_TREND":
            row = bundle.native.index[-1]
            bundle.native.loc[row, "Close"] += 2
            bundle.native.loc[row, "High"] = max(
                bundle.native.loc[row, "High"], bundle.native.loc[row, "Close"]
            )
        return bundle

    monkeypatch.setattr(DemoProvider, "fetch", changed)
    after = client.get("/api/analysis/DEMO_TREND?refresh=true").json()
    watch = client.get("/api/watchlist?mode=demo").json()
    item = next(w for w in watch if w["symbol"] == "DEMO_TREND")
    assert after["metrics"]["Close"] > before["metrics"]["Close"]
    assert after["metrics"]["daily_change"] != before["metrics"]["daily_change"]
    assert item["close"] == after["metrics"]["Close"]
    assert item["change"] == after["metrics"]["daily_change"]
    assert after["relative"]["returns"]["1 month"]["stock"] != before["relative"]["returns"]["1 month"]["stock"]


def test_current_session_quote_is_separate_from_completed_analysis(monkeypatch, tmp_path):
    from compass.providers import yahoo
    from compass.providers.base import Bundle
    from compass.models import Instrument
    from compass.normalization import utcnow, schedule

    service_app = create_app(tmp_path / "quote.sqlite", offline=False)
    store = service_app.state.store
    store.set("source:ZZQFIXTURE", "yfinance")
    store.set("settings", {"mode": "live", "benchmark": "ZZQFIXTURE"})
    store.add_watch("ZZQFIXTURE")
    session = schedule("2026-09-29", "2026-09-29").iloc[0]
    at = session.market_open + pd.Timedelta(hours=1)
    now = at.to_pydatetime() + __import__("datetime").timedelta(minutes=5)
    info = dict(regularMarketPrice=105, regularMarketPreviousClose=100, regularMarketTime=int(at.timestamp()))
    available = yahoo.current_session_quote(info, now)
    assert available["status"] == "available"
    assert available["data"]["change_percent"] == pytest.approx(5)
    assert yahoo.current_session_quote(info, now + __import__("datetime").timedelta(hours=1))["status"] == "unavailable"
    original = __import__("compass.providers.demo", fromlist=["DemoProvider"]).DemoProvider().fetch("DEMO_TREND")
    native = original.native.copy()
    native["Adj Close"] = native.Close
    instrument = Instrument(symbol="ZZQFIXTURE", name="Test fixture", exchange="NMS", currency="USD", instrument_type="EQUITY")
    def fetch(self, symbol):
        assert symbol == "ZZQFIXTURE"
        q = dict(available)
        q["data"] = dict(q["data"], session="2026-09-30", market_time=utcnow().isoformat())
        return Bundle(instrument, native, "split_dividend_adjusted", "fake Yahoo fixture", {"quote":q})
    monkeypatch.setattr(yahoo.YahooProvider, "fetch", fetch)
    with TestClient(service_app) as client:
        a = client.get("/api/analysis/ZZQFIXTURE?refresh=true").json()
        w = client.get("/api/watchlist?mode=live").json()[0]
    assert a["metrics"]["Close"] != w["quote"]["price"]
    assert w["quote"]["change_percent"] == pytest.approx(5)
    assert w["change"] == a["metrics"]["daily_change"]
    monkeypatch.setattr(yahoo.YahooProvider, "fetch", lambda self, symbol: (_ for _ in ()).throw(__import__("compass.providers.base", fromlist=["ProviderError"]).ProviderError("Provider unavailable")))
    with TestClient(service_app) as client:
        failed = client.get("/api/analysis/ZZQFIXTURE?refresh=true").json()
        row = client.get("/api/watchlist?mode=live").json()[0]
    assert failed["context"]["quote"]["status"] == "unavailable"
    assert row["quote"] is None
    assert failed["metrics"]["Close"] == a["metrics"]["Close"]


def test_csv_preview_import_unknown_blocks(client):
    csv = (Path(__file__).resolve().parents[2] / "fixtures/DEMO_RANGE.csv").read_text()
    req = dict(
        symbol="DEMO_CSV",
        name="Synthetic import",
        exchange="NYSE",
        currency="USD",
        price_basis="unknown",
        csv=csv,
    )
    preview = client.post("/api/csv/preview", json=req)
    assert preview.status_code == 200
    assert not preview.json()["quality"]["actionable"]
    assert client.post("/api/csv/import", json=req).status_code == 200
    a = client.get("/api/analysis/DEMO_CSV")
    assert a.status_code == 200, a.text
    assert a.json()["assessment"]["label"] == "Insufficient or stale data"
    assert (
        client.post("/api/backtest/DEMO_CSV", json={"strategy": "breakout"}).status_code
        == 422
    )


def test_adjustment_consistent_ohlc_and_unmodified_volume():
    native = pd.DataFrame(
        dict(
            Open=[100.0, 50.0],
            High=[110.0, 55.0],
            Low=[90.0, 45.0],
            Close=[100.0, 50.0],
            Volume=[1000.0, 2000.0],
            **{
                "Adj Close": [49.0, 50.0],
                "Dividends": [0.0, 1.0],
                "Stock Splits": [0.0, 2.0],
            },
        ),
        index=pd.to_datetime(["2024-01-02", "2024-01-03"]),
    )
    adjusted = adjust_native(native)
    assert adjusted.Open.iloc[0] == 49
    assert adjusted.High.iloc[0] == pytest.approx(53.9)
    assert adjusted.Low.iloc[0] == pytest.approx(44.1)
    assert adjusted.Volume.equals(native.Volume)
    shaped = pd.concat({"MU": native}, axis=1).swaplevel(axis=1)
    pd.testing.assert_frame_equal(flatten_native(shaped, "MU"), native)


def test_stale_cached_and_csrf(client):
    client.get("/api/analysis/DEMO_TREND")
    s = client.app.state.service
    store = client.app.state.store
    v = store.cached(s.key("DEMO_TREND"))
    v["instrument"]["symbol"] = "TEST"
    v["instrument"]["synthetic"] = False
    native = pd.read_json(__import__("io").StringIO(v["native"]), orient="split")
    native["Adj Close"] = native.Close
    v["native"] = native.to_json(orient="split", date_format="iso")
    store.cache(s.key("TEST"), v)
    f = s.load("TEST", allow_download=False)
    # Fixture latest date is historical; select a deliberately old last candle.
    old = f[1].iloc[:-30]
    _, q = normalize(old, "split_dividend_adjusted")
    assert q["stale"] and not q["actionable"]
    r = client.put("/api/settings", headers={"Origin": "https://evil.example"}, json={})
    assert r.status_code == 403
