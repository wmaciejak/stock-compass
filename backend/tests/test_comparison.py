from pathlib import Path
from fastapi.testclient import TestClient
from compass.api import create_app


def test_comparison_calculated_in_backend_on_matching_sessions(tmp_path):
    client = TestClient(create_app(tmp_path / "db.sqlite", offline=True))
    result = client.post("/api/compare", json={"symbols": ["DEMO_TREND", "DEMO_RANGE"]})
    assert result.status_code == 200, result.text
    data = result.json()
    assert len(data["analyses"]) == 2 and len(data["series"]) == 127
    assert data["series"][0]["DEMO_TREND"] == 0
    assert data["series"][0]["DEMO_RANGE"] == 0
    a = data["analyses"][0]
    closes = {b["time"]: b["Close"] for b in a["bars"]}
    assert (
        data["series"][-1]["DEMO_TREND"]
        == (closes[data["end"]] / closes[data["start"]] - 1) * 100
    )
    assert (
        client.post(
            "/api/compare", json={"symbols": ["DEMO_TREND", "DEMO_TREND"]}
        ).status_code
        == 422
    )
