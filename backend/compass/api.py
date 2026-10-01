from pathlib import Path
import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from compass.models import *
from compass.persistence import Store
from compass.service import ResearchService, symbol_name
from compass.providers.base import ProviderError
from compass.providers.yahoo import fetch_news
from compass.indicators import ENGINE
from compass.rules import VERSION
from compass.normalization import utcnow, expected_session
from compass.sizing import size_position
from compass.backtests import run_backtest
from compass.exports import markdown_report, bars_csv
from compass.explanations import TERMS
from compass.analysis import compare_analyses

ROOT = Path(__file__).resolve().parents[2]


def create_app(db=None, offline=None, ai_config=None, ai_client=None):
    store = Store(
        db or os.environ.get("STOCK_COMPASS_DB", ROOT / "data/compass.sqlite")
    )
    service = ResearchService(
        store,
        offline=offline
        if offline is not None
        else os.environ.get("STOCK_COMPASS_OFFLINE") == "1",
    )
    app = FastAPI(title="Stock Compass", version="1.0.0")
    app.state.store = store
    app.state.service = service
    from compass.rookie_routes import create_rookie_router
    app.include_router(create_rookie_router(service))
    from compass.ai.config import load_ai_config
    from compass.ai.jobs import AiJobs
    from compass.ai.routes import create_ai_router
    from compass.ai.models import AiError
    ai_jobs = AiJobs(store,service,ai_config or load_ai_config(offline=service.offline),ai_client)
    ai_jobs.recover_interrupted()
    app.state.ai_jobs = ai_jobs
    app.include_router(create_ai_router(ai_jobs))

    @app.exception_handler(AiError)
    async def ai_error(request,e):
        from fastapi.responses import JSONResponse
        code = 404 if e.code=='not_found' else 409 if e.code in ('request_conflict','ai_busy') else 422 if e.code in ('context_unavailable','context_too_large') else 503
        return JSONResponse(status_code=code,content=dict(detail=str(e),code=e.code))
    port = os.environ.get("STOCK_COMPASS_PORT", "8765")
    origins = [
        f"http://127.0.0.1:{port}",
        f"http://localhost:{port}",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )

    @app.middleware("http")
    async def local_writes(request: Request, call_next):
        if (
            request.method in ["POST", "PUT", "DELETE"]
            and request.headers.get("origin")
            and request.headers["origin"] not in origins
        ):
            return Response("Local origin required.", status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(ProviderError)
    async def provider_error(request, e):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=503, content=dict(detail=str(e), code=e.code))

    @app.exception_handler(ValueError)
    async def invalid(request, e):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=422, content=dict(detail=str(e)))

    @app.get("/api/status")
    def status():
        return dict(
            backend="available",
            engine=ENGINE,
            rule_version=VERSION,
            cache_entries=store.cache_count(),
            database=str(store.path),
            provider=store.get(
                "provider_status",
                dict(
                    status="not_checked", reason="Live provider has not been checked."
                ),
            ),
            offline=service.offline,
            expected_session=expected_session(),
            publication_allowance_minutes=120,
            timestamp=utcnow().isoformat(),
            ai=("Optional OpenAI summaries enabled · "+ai_jobs.config.model if ai_jobs.config.enabled else "Optional OpenAI summaries disabled; deterministic assessments available."),
            ai_status=ai_jobs.status(),
            capabilities={
                "demo": {
                    "hourly_history": True,
                    "current_session_quote": False,
                    "price_history": True,
                    "symbol_metadata": True,
                    "corporate_actions": False,
                    "earnings": False,
                    "fundamentals": False,
                    "news": False,
                },
                "yfinance": {
                    "hourly_history": True,
                    "current_session_quote": True,
                    "price_history": True,
                    "symbol_metadata": True,
                    "corporate_actions": True,
                    "earnings": True,
                    "fundamentals": True,
                    "news": True,
                },
                "csv": {
                    "hourly_history": False,
                    "current_session_quote": False,
                    "price_history": True,
                    "symbol_metadata": "user-declared",
                    "corporate_actions": False,
                    "earnings": False,
                    "fundamentals": False,
                    "news": False,
                },
            },
            terms=TERMS,
        )

    @app.get("/api/settings", response_model=Settings)
    def settings():
        return service.settings()

    @app.put("/api/settings", response_model=Settings)
    def save_settings(value: Settings):
        value.benchmark = symbol_name(value.benchmark)
        if value.benchmark.startswith("DEMO_"):
            raise ValueError(
                "Choose a real USD benchmark for live mode. Demo always uses DEMO_MARKET."
            )
        store.set("settings", value.model_dump())
        return value

    @app.get("/api/watchlist")
    def watchlist(mode: str = "demo"):
        symbols = [
            s for s in store.watchlist() if s.startswith("DEMO_") == (mode == "demo")
        ]
        return sorted([service.summary(s) for s in symbols], key=lambda x: -x["score"])

    @app.post("/api/watchlist")
    def add(value: SymbolInput):
        s = symbol_name(value.symbol)
        if len(store.watchlist()) >= 50 and s not in store.watchlist():
            raise ValueError("Watchlist is limited to 50 instruments.")
        service.load(s)
        store.add_watch(s)
        return dict(symbol=s)

    @app.delete("/api/watchlist/{symbol}")
    def remove(symbol: str):
        store.remove_watch(symbol_name(symbol))
        return {"ok": True}

    @app.get("/api/analysis/{symbol}", response_model=Analysis)
    def analysis(symbol: str, refresh: bool = False, refresh_benchmark: bool = True):
        return service.analysis(symbol, refresh, refresh_benchmark)

    @app.get("/api/chart/{symbol}", response_model=HourlyChart)
    def chart(symbol: str, interval: Literal["1h"] = "1h", refresh: bool = False):
        from compass.intraday import hourly_chart
        return hourly_chart(service, symbol, refresh)

    @app.post("/api/compare", response_model=ComparisonResult)
    def comparison(value: CompareInput):
        symbols = [symbol_name(s) for s in value.symbols]
        if len(set(symbols)) != len(symbols):
            raise ValueError("Choose distinct instruments for comparison.")
        return compare_analyses([service.analysis(s) for s in symbols])

    @app.post("/api/context/{symbol}")
    def context(symbol: str):
        s = symbol_name(symbol)
        key = service.key(s)
        v = store.cached(key)
        if not v:
            raise ValueError("Load price analysis first.")
        if service.source(s) != "yfinance" or service.offline:
            return v["context"]
        existing = v["context"].get("news", {})
        if existing.get("retrieved_at"):
            return v["context"]
        v["context"]["news"] = fetch_news(s)
        store.cache(key, v)
        return v["context"]

    @app.post("/api/csv/preview")
    def preview(value: CSVInput):
        return service.preview_csv(value)[1]

    @app.post("/api/csv/import")
    def import_csv(value: CSVInput):
        b, preview = service.preview_csv(value)
        if not preview["rows"] or not preview["last_date"]:
            raise ValueError("No valid completed bars to import.")
        if value.symbol.startswith("DEMO_") and value.symbol in [
            "DEMO_TREND",
            "DEMO_MARKET",
            "DEMO_RANGE",
            "DEMO_VOLATILE",
        ]:
            raise ValueError(
                "Built-in demo fixtures are immutable. Use a different DEMO_ name for synthetic imports."
            )
        # Explicit import replaces the entire source series, never stitches data.
        store.set("source:" + value.symbol, "csv")
        store.set("basis:" + value.symbol, b.basis)
        store.set(
            "range:" + value.symbol, f"{preview['first_date']}:{preview['last_date']}"
        )
        store.set("failure:" + value.symbol, None)
        service.save_bundle(value.symbol, b)
        store.add_watch(value.symbol)
        return preview

    @app.post("/api/backtest/{symbol}")
    def backtest(symbol: str, value: BacktestInput):
        s = symbol_name(symbol)
        instrument, f, q, p, _ = service.load(s, allow_download=False)
        if not q["actionable"]:
            raise ValueError(
                "Backtest blocked: stale, insufficient, corrupted or unknown-basis history. "
                + "; ".join(q["issues"])
            )
        result = run_backtest(
            f, value.strategy, value.commission, value.spread, value.cash
        )
        result["provenance"] = p
        result["synthetic"] = instrument.synthetic
        config = value.model_dump()
        config["retrieved_at"] = p["retrieved_at"]
        store.set("backtest_config:" + s + ":" + value.strategy, config)
        store.set("backtest:" + s + ":" + value.strategy, result)
        return result

    @app.get("/api/backtest/{symbol}")
    def saved_backtests(symbol: str):
        s = symbol_name(symbol)
        v = store.cached(service.key(s))
        out = {}
        for kind in ["crossover", "breakout"]:
            result = store.get("backtest:" + s + ":" + kind)
            if (
                result
                and v
                and result.get('rule_version') == VERSION
                and result["provenance"]["retrieved_at"] == v["retrieved_at"]
            ):
                out[kind] = result
        return out

    @app.post("/api/sizing")
    def sizing(v: SizingInput):
        return size_position(**v.model_dump())

    @app.get("/api/notes/{symbol}")
    def note(symbol: str):
        return {"text": store.note(symbol_name(symbol))}

    @app.put("/api/notes/{symbol}")
    def save_note(symbol: str, v: NoteInput):
        return {"text": store.note(symbol_name(symbol), v.text)}

    @app.post("/api/snapshots/{symbol}")
    def snapshot(symbol: str):
        a = service.analysis(symbol)
        return {"id": store.save_snapshot(a.instrument.symbol, a.model_dump())}

    @app.get("/api/snapshots/{symbol}")
    def snapshots(symbol: str):
        return store.snapshots(symbol_name(symbol))

    @app.get("/api/journal")
    def journal():
        return store.journal()

    @app.post("/api/journal")
    def save_idea(v: JournalInput):
        v.symbol = symbol_name(v.symbol)
        return {"id": store.save_idea(v)}

    @app.put("/api/journal/{id}")
    def update_idea(id: int, v: JournalInput):
        return {"id": store.save_idea(v, id)}

    @app.get("/api/export/{symbol}")
    def export(symbol: str, format: str = "markdown", language: Literal["en", "pl"] | None = None):
        a = service.analysis(symbol)
        name = a.instrument.symbol
        if format == "csv":
            text = bars_csv(a)
            extension = "csv"
            mime = "text/csv"
        elif format == "markdown":
            text = markdown_report(a, saved_backtests(name), language or service.settings().language)
            extension = "md"
            mime = "text/markdown"
        else:
            raise ValueError("Choose markdown or csv.")
        return Response(
            text,
            media_type=mime,
            headers={
                "Content-Disposition": f'attachment; filename="Stock-Compass-{name}.{extension}"'
            },
        )

    dist = ROOT / "frontend/dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}")
        def index(path: str):
            if path.startswith("api/"):
                raise HTTPException(404, "Unknown API route.")
            return FileResponse(dist / "index.html")

    return app


app = create_app()
