from fastapi.testclient import TestClient
from compass.api import create_app
from compass.rules import VERSION


def test_language_setting_persists_without_changing_calculated_analysis(tmp_path):
    path = tmp_path / "compass.sqlite"
    client = TestClient(create_app(path, offline=True))
    settings = client.get("/api/settings").json()
    assert settings.get("language") == "en"
    before = client.get("/api/analysis/DEMO_TREND").json()
    settings["language"] = "pl"
    saved = client.put("/api/settings", json=settings)
    assert saved.status_code == 200
    assert saved.json()["language"] == "pl"
    reopened = TestClient(create_app(path, offline=True))
    assert reopened.get("/api/settings").json()["language"] == "pl"
    after = reopened.get("/api/analysis/DEMO_TREND").json()
    assert after["metrics"] == before["metrics"]
    assert after["assessment"]["label"] == before["assessment"]["label"]
    assert after["assessment"]["strategy_signals"] == before["assessment"]["strategy_signals"]
    settings["language"] = "de"
    assert client.put("/api/settings", json=settings).status_code == 422


def test_polish_report_preserves_provenance_and_synthetic_label(tmp_path):
    client = TestClient(create_app(tmp_path / "compass.sqlite", offline=True))
    report = client.get("/api/export/DEMO_TREND?language=pl")
    assert report.status_code == 200
    assert "DANE SYNTETYCZNE" in report.text
    assert "Przesłanki wspierające" in report.text
    assert "DEMO_TREND" in report.text and VERSION in report.text
    assert "split_dividend_adjusted" in report.text
    assert "2026-09-29" in report.text
    assert client.get("/api/export/DEMO_TREND?language=de").status_code == 422
