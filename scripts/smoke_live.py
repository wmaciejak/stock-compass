"""Separate live-data integration check; never substitute a fixture on failure."""

import json
from pathlib import Path
import httpx

if __name__ == "__main__":
    try:
        r = httpx.get("http://127.0.0.1:8765/api/analysis/MU?refresh=true", timeout=180)
        if r.status_code != 200:
            raise RuntimeError(f"{r.status_code}: {r.text[:500]}")
        a = r.json()
        assert not a["instrument"]["synthetic"]
        assert a["provenance"]["source"].startswith("yfinance")
        assert len(a["bars"]) > 200
        assert a["metrics"]["sma200"] is not None
        assert a["provenance"]["price_basis"] == "split_dividend_adjusted"
        result = dict(
            integration="passed",
            instrument=a["instrument"],
            provenance=a["provenance"],
            quality=a["assessment"]["data_quality"],
            engine=a["engine"],
            benchmark_status=a["relative"]["status"],
            bars=len(a["bars"]),
        )
    except Exception as e:
        result = dict(integration="failed", reason=str(e))
    Path("docs/live-smoke.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["integration"] == "passed" else 1)
