# Summarize with AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the user selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ticker-level button that sends complete available app research context and a specialized prompt to OpenAI, then displays a sourced recommendation and conditional outlook.

**Architecture:** React submits typed browser drafts and starts a persistent local FastAPI job. The backend prepares missing context through existing providers, freezes a SQLite research snapshot, and calls the OpenAI Responses API with strict Pydantic output. Results are stored locally, keyed to their source context, model, prompt, horizon and language.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, SQLite, official OpenAI Python SDK, existing pandas/TA-Lib calculations, React 19, TypeScript, Playwright and pytest.

**Spec:** [Proposed design](../specs/2026-09-30-ai-ticker-summary-design.md). User approved implementation with GPT-6.1 Sol on September 30, 2026. No paid calls are required to build or test the feature.

**Implementation status:** All five tasks complete. The step lists below preserve the original build brief; the [execution ledger](../../../.superpowers/sdd/2026-09-30-ai-ticker-summary/progress.md) and [verification record](../../VERIFICATION.md) record actual checks and review fixes. Final verification: 87 backend tests, 26 browser workflows and production build passed. Recovery now also has a read-only request-UUID route; existing outdated results require explicit Regenerate.

## Global constraints

- The button is **Summarize with AI** in English and **Podsumuj z AI** in Polish; it appears in every ticker row and detail heading.
- Cover the selected research horizon, with a separate near-term section for the next 1–5 trading sessions.
- Model default: `gpt-6.1-sol`, explicitly selected by the user; verified against official documentation. Do not silently substitute another model.
- Require `STOCK_COMPASS_AI_ENABLED=1`, backend `OPENAI_API_KEY` and `STOCK_COMPASS_OFFLINE=0` for any paid call.
- API defaults: `reasoning.effort=high`, `store=False`, `max_output_tokens=12000`, 240-second timeout, `max_retries=0`.
- Application context limit: 2,000,000 UTF-8 bytes. Oversized context fails explicitly before an AI call; no silently truncated evidence.
- Capture complete available ticker/benchmark research and expose included/missing sections. Historical results and snapshots retain their original dates and restrictions.
- Preserve daily adjustment, hourly/quote price basis, quote usability, synthetic identity, missing values and existing data-quality restrictions.
- AI jobs are user-triggered. Opening pages, polling, auto-refresh, changing language/horizon and restarting never generate AI requests.
- One global active job; persistent UUID idempotency; saved immutable results; source changes mark results outdated.
- Preserve local-origin/Host protections. No keys, environment dumps, internal paths or full prompts in status/error logs.
- Automated tests use fake clients/intercepted endpoints and temporary databases. Real OpenAI usage requires a separately requested smoke.
- The present workspace has no Git repository. Do not initialize Git or attempt commits as part of this feature unless requested.

## Review focus

1. A cleared unsaved note must override saved text, while an absent draft must preserve it — Task 2 context test and Task 5 browser test.
2. Quotes can expire and daily quality can become stale without a download — Task 2 clock-controlled test and Task 5 changed-context test.
3. Two clicks, a browser reload or a timeout must not silently create a second paid call — Task 4 concurrency/idempotency/recovery tests.
4. A provider-native hourly level cannot replace an adjusted daily trading level — Task 3 semantic validation test.
5. Source changes during generation must leave the saved response attached to its original ticker/context — Task 4 snapshot test and Task 5 response-race test.

## File map

| File | Responsibility |
| --- | --- |
| `backend/compass/ai/__init__.py` | AI package boundary. |
| `backend/compass/ai/models.py` | Request/context/result/run/status contracts. |
| `backend/compass/ai/config.py` | Environment configuration and disabled reasons. |
| `backend/compass/ai/snapshot.py` | Read-only adapter for atomically captured research records. |
| `backend/compass/ai/context.py` | Missing-context preparation, full evidence assembly, compact encoding, manifest and fingerprint. |
| `backend/compass/ai/prompt.md` | Exact versioned specialized prompt from the spec. |
| `backend/compass/ai/client.py` | Responses call, sanitization and semantic validation. |
| `backend/compass/ai/jobs.py` | Slot reservation, lifecycle, cache reuse and restart handling. |
| `backend/compass/ai/routes.py` | Typed AI endpoints; injected job/client dependencies. |
| `backend/compass/persistence.py` | Additive AI schema and atomic read/write helpers. |
| `backend/compass/service.py`, `intraday.py` | Cache-only analysis options used by immutable snapshots. |
| `backend/compass/api.py` | Initialize AI service/router and truthful existing status. |
| `frontend/src/ResearchContext.tsx` | In-memory drafts and comparison selection, keyed by symbol. |
| `frontend/src/AiSummary.tsx` | Button, result panel, job polling, evidence and lifecycle UI. |
| `frontend/src/main.tsx`, `App.tsx` | Mount context provider and wire both ticker actions. |
| `frontend/src/Research.tsx`, `Workspace.tsx` | Register drafts/comparison; show AI configuration status. |
| `frontend/src/types.ts`, `api.ts`, `styles.css` | Type contracts, coded errors, responsive accessible presentation. |
| `locales/app.pl.json`, `locales/workspace.pl.json` | Polish AI labels, errors and revised service descriptions. |
| `backend/tests/ai_helpers.py`, `test_ai_config.py`, `test_ai_context.py`, `test_ai_client.py`, `test_ai_jobs.py`, `test_ai_api.py` | Isolated fake API and backend behavior coverage. |
| `frontend/tests/ai-summary.spec.ts` | Browser workflows with intercepted AI routes. |
| `.env.example`, `pyproject.toml`, `requirements.lock`, `README.md`, `docs/AI.md` | Optional setup, SDK dependency, context semantics and recorded verification. |

## Task 1: Define configuration and typed contracts

**Files:** Create AI package, `models.py`, `config.py`, `backend/tests/test_ai_config.py`; update `.env.example`.

**Interfaces:**

```python
load_ai_config(*, offline: bool) -> AiConfig
AiConfig.enabled: bool
AiConfig.disabled_reason: str | None  # ai_disabled, missing_key, ai_offline
AiConfig.model: str
AiConfig.reasoning: str
AiConfig.max_output_tokens: int
AiConfig.timeout_seconds: float
AiConfig.max_context_bytes: int
```

The key is held privately in configuration and excluded from serialization/repr. `AiConfig.public_status()` returns only enabled/reason/model/defaults.

Define `AiSummaryRequest` with `extra="forbid"`, a UUID request ID, existing `Horizon`, `language: Literal["en", "pl"]`, `mode: Literal["demo", "live"]`, `force: bool=False`, and `browser_context` defaulting to an empty object. Browser context fields:

```python
class BrowserContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note_draft: str | None = Field(default=None, max_length=10000)
    thesis_draft: str | None = Field(default=None, max_length=10000)
    sizing_input: SizingInput | None = None
    sizing_form: dict[str, str] | None = None
    comparison_symbols: list[str] = Field(default_factory=list, max_length=4)
```

Validate `sizing_form` keys against the existing calculator input names and bound string values to 64 characters. Preserve these current form values even when incomplete. `sizing_input` is the last successfully calculated input snapshot; recompute its displayed result server-side so editing the current form does not silently relabel the earlier result. Do not accept a client-supplied numeric sizing result as authoritative. Journal/thesis text is evidence, not proof of holdings.

Define `AiContext` with `payload: dict`, `evidence: dict[str, EvidenceSource]`, `manifest: list[ContextSection]`, `fingerprint: str`, `daily_actionable: bool`. `EvidenceSource` includes a label, source category/path, interval/basis where relevant and the captured JSON value. `ContextSection` includes name, status, reason, count, first/last date and byte count.

Define model output with the following required fields; use strict schemas, required nullable fields and bounded arrays where the SDK supports them:

| Type | Fields |
| --- | --- |
| `AiClaim` | `text: str`, `source_refs: list[str]` |
| `AiLevel` | `label: str`, `role` (support/resistance/entry/entry_max/stop/target/observation), `value: float`, `source_ref: str`, `interval: Literal["1d","1h"]`, `price_basis: str` |
| `AiScenario` | `kind: Literal["base","bull","bear"]`, `outlook: AiClaim`, `confirmation: AiClaim`, `invalidation: AiClaim`, `levels: list[AiLevel]`, `events: list[AiClaim]` |
| `AiSummaryContent` | `symbol`, `horizon`, `language`, `summary: AiClaim`, `recommendation` (four spec enums), `rationale: list[AiClaim]`, `counterargument: AiClaim`, `confidence` (low/moderate/high), `confidence_reason: AiClaim`, `near_term: AiClaim`, `scenarios: list[AiScenario]`, `best_supported_scenario`, `next_observations: list[AiClaim]`, `risks: list[AiClaim]`, `missing_context: list[str]` |
| `AiSummary` | `content: AiSummaryContent`, backend metadata: generated time, model, response ID, usage, prompt/schema versions, fingerprint, source dates, manifest, captured `browser_context` |
| `AiRunView` | ID, symbol, horizon, language, state, created/updated times, result or coded sanitized error, context_changed, optional reused_from |

`AiSummaryContent.scenarios` has exactly three entries with unique base/bull/bear kinds, enforced in local validation. Backend metadata is outside the model-generated schema. The four recommendation enums are `consider_buy_setup`, `wait_for_confirmation`, `avoid_new_entry`, `insufficient_data`.

- [ ] Write configuration tests before implementation: missing key, default disabled, explicit enablement, offline override, invalid timeout/token/budget/effort, and public serialization/repr containing no key.
- [ ] Add this key-protection test, setting only a dummy test credential:

```python
def test_offline_disables_ai_without_exposing_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    monkeypatch.setenv("STOCK_COMPASS_AI_ENABLED", "1")
    config = load_ai_config(offline=True)
    assert not config.enabled
    assert config.disabled_reason == "ai_offline"
    assert "test-secret" not in str(config.public_status())
    assert "test-secret" not in repr(config)
```

- [ ] Run `.venv/bin/python -m pytest backend/tests/test_ai_config.py -q`; establish a failing baseline for absent contracts.
- [ ] Implement the contracts and validated defaults, copying the environment example from the spec and retaining offline configuration comments.
- [ ] Run the same test command and verify the successful output before Task 2.

## Task 2: Assemble a complete immutable research context

**Files:** Create `snapshot.py`, `context.py`, `test_ai_context.py`; modify `persistence.py`, `service.py`, `intraday.py`.

**Interfaces:**

```python
Store.read_ai_snapshot(symbol: str, comparison_symbols: list[str]) -> dict
ResearchSnapshot.from_records(records: dict) -> ResearchSnapshot
ResearchSnapshot.store  # read-only subset of Store interface
prepare_context(service: ResearchService, request: AiSummaryRequest, symbol: str) -> None
build_context(snapshot: ResearchSnapshot, request: AiSummaryRequest,
              config: AiConfig, *, now: datetime) -> AiContext
ResearchService.analysis(symbol, refresh=False, refresh_benchmark=True,
                         allow_download=True) -> Analysis
hourly_chart(service, symbol, refresh=False, allow_download=True) -> HourlyChart
```

`prepare_context` fills missing supported daily/benchmark/hourly/news caches through current bounded services. It checks offline policy first. Existing daily/hourly data are not automatically refreshed; missing news uses the existing bounded `fetch_news`. Do not simulate missing backtests. Retain provider errors as category status when usable daily context remains.

`read_ai_snapshot` uses one read transaction to capture relevant cache rows, settings/source/basis/range/failure keys, watchlist records, both strategy configurations/results, target notes/journal entries and every full target analysis snapshot. Include cached comparison participants and watchlist summary inputs. The read-only adapter exposes `get`, `cached`, `watchlist`, `latest_snapshot`, `note`, `journal`, and snapshot records without writes/downloads. Overlay request horizon/language/mode on the copied settings only.

Extract pure cache-to-hourly normalization if necessary, preserving the existing public default. Pass `allow_download=False` to stock and benchmark loads when rebuilding analysis. `build_context` cannot contact providers or write persistent state.

Encode every array completely. Shared column/row representations and duplicate series references are lossless. Use evidence IDs such as `daily.metrics.rsi14`, `daily.zones.0.low`, `hourly.zones.0.low`, `context.earnings.data.date`, `journal.12.thesis`. The evidence map and manifest refer to the same captured values. Include missing category entries rather than omitting sections.

The canonical fingerprint removes only generation/capture timestamps and transport cache flags, preserving semantic timestamps/quality. Include model configuration, prompt/schema versions, request settings and browser drafts. Hash compact canonical JSON with `allow_nan=False`. Expired quote usability, expected completed dates and calculated quality are semantic values: time passing can invalidate an old result.

- [ ] Create temporary-database context tests with real demo fixtures and the existing analysis/snapshot/journal/backtest APIs. Assert full bar counts, both saved strategies, all snapshots/journal entries, current mode watchlist, education/terms, matching benchmark and manifest counts. Never use `data/compass.sqlite` in a test.
- [ ] Pin draft absence/clearing and fingerprint behavior:

```python
def test_draft_absence_differs_from_explicit_clear():
    absent = BrowserContext()
    cleared = BrowserContext(note_draft="")
    assert absent.note_draft is None
    assert cleared.note_draft == ""

def test_lossless_table_preserves_nulls_and_precision():
    rows = [{"time": "2026-09-29", "Close": 101.123456789, "rsi14": None}]
    table = encode_rows(rows)
    assert decode_rows(table) == rows
```

Define `encode_rows(rows: list[dict]) -> dict` and `decode_rows(table: dict) -> list[dict]` in `context.py`; store ordered columns and all rows, preserving first appearance of keys.

- [ ] Add clock-controlled tests for quote expiry/session restrictions and stale daily history; basis-mismatch benchmark and hourly native restrictions; unavailable CSV hourly; incomplete sizing; cached provider failures; old backtest flags; injection-like note/headline text preserved as data; and context above the byte limit raising `context_too_large` without calling a fake client.
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_ai_context.py -q` and verify the failing cases correspond to the missing context builder.
- [ ] Implement preparation, atomic capture, read-only rebuild, manifest, evidence mapping, size check and hash. Verify every row/category listed in the spec is represented.
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_ai_context.py backend/tests/test_hourly.py backend/tests/test_core.py backend/tests/test_horizons.py -q`; confirm existing analysis defaults still behave the same.

## Task 3: Call OpenAI with the specialized prompt and validate the result

**Files:** Create `prompt.md`, `client.py`, `backend/tests/ai_helpers.py`, `test_ai_client.py`; modify `pyproject.toml`, regenerate `requirements.lock` using the existing environment/setup workflow.

**Interfaces:**

```python
PROMPT_VERSION = "stock-compass-ai-v1"
SCHEMA_VERSION = "stock-compass-ai-schema-v1"
generate_summary(context: AiContext, request: AiSummaryRequest,
                 config: AiConfig, *, client) -> AiSummary
validate_summary(content: AiSummaryContent, context: AiContext,
                 request: AiSummaryRequest) -> None
AiError(code: str, message: str, *, delivery_unknown: bool = False)
```

The SDK client is injected. Production construction supplies the private key, timeout and `max_retries=0`; tests use only a fake. Copy the exact prompt from the spec into `prompt.md`. Send two distinct messages: developer instructions and the context as user data.

The core SDK call is:

```python
response = client.responses.parse(
    model=config.model,
    reasoning={"effort": config.reasoning},
    input=[
        {"role": "developer", "content": prompt_text},
        {"role": "user", "content": context_json},
    ],
    text_format=AiSummaryContent,
    max_output_tokens=config.max_output_tokens,
    store=False,
)
```

Do not send tools, temperature parameters unsupported by the chosen model, previous_response_id, secret configuration or another AI summary as a substitute for raw context. Require completed status and parsed content; separately map refusal/incomplete output.

Validate request identity, scenario kinds, source references and finite numeric levels. A level's value/interval/basis must match its evidence source. Entry/entry_max/stop/target roles must reference the current `daily.assessment.scenario`, preserve its execution conditions, and satisfy its ordering. Withhold those roles and reject `consider_buy_setup` when daily quality is restricted or no defensible current daily scenario exists. Native hourly levels remain qualified hourly observations; they cannot populate daily action levels. Unavailable metadata cannot be fabricated into earnings/fundamental claims.

Map SDK authentication/model errors, rate limits, provider errors, refusal, incomplete parsing and timeouts to the spec's stable codes. A timeout/connection failure after possible delivery is `delivery_unknown`; never retry automatically. Return only sanitized messages. API-level structured shape does not guarantee that prose interpretation is correct: manually inspect fixture results during review.

- [ ] Implement a fake recording SDK in `ai_helpers.py` with `responses.parse(**kwargs)` returning a controlled response or raising a controlled exception. Define a complete `make_summary_content(symbol, horizon, language, actionable)` factory using the Task 1 schema and existing evidence IDs. Define `make_fake_response(content)` with completed status, `output_parsed`, response ID, returned model and usage fields. These are test-only helpers.
- [ ] Write tests that inspect every SDK argument; ensure dummy keys/private configuration are absent from prompt/messages; notes/news remain in the user message; and returned metadata uses actual SDK values.
- [ ] Parameterize semantic/error tests: wrong symbol/language/horizon, unknown reference, NaN level, altered level, interval/basis mismatch, invalid scenario count, restricted-quality buy, refusal, incomplete status, parse exception, 401, unavailable model, 429, 5xx and ambiguous timeout. Confirm one SDK call per attempted generation and no retry.
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_ai_client.py -q` and establish failure before implementation.
- [ ] Add the official SDK at a version verified to support the documented `responses.parse` call; pin the installed version and transitive dependencies in `requirements.lock`. Implement the prompt/client/validation without running a real API call.
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_ai_client.py backend/tests/test_ai_config.py -q`; verify all cases pass.

## Task 4: Persist jobs, expose endpoints and recover safely

**Files:** Create `jobs.py`, `routes.py`, `test_ai_jobs.py`, `test_ai_api.py`; modify `persistence.py` and `api.py`.

**Interfaces:**

```python
AiJobs(store: Store, service: ResearchService, config: AiConfig, client)
AiJobs.submit(symbol: str, request: AiSummaryRequest) -> AiRunView
AiJobs.execute(run_id: str) -> None
AiJobs.get(run_id: str) -> AiRunView
AiJobs.latest(symbol: str, *, horizon: Horizon, language: str) -> AiRunView | None
AiJobs.recover_interrupted() -> int
create_ai_router(jobs: AiJobs) -> APIRouter
```

`latest` internally compares the current cached context, rebuilding with the run's captured browser context and click-time settings. Public latest GET takes horizon/language only. Return captured browser context in result metadata; the frontend compares it with current drafts/comparison input and adds its own changed-context state. Latest GET never downloads missing context. Context rebuild reuses the same clock/quality rules as Task 2.

Add the SQLite table with: ID, unique client request ID, symbol, request JSON/submission hash, horizon/language, state, context JSON/fingerprint, result JSON, error code/message, model/response ID/usage, prompt/schema versions, api_call_count, reused_from, created/started/completed/updated times. Keep existing tables/data intact.

Reserve the active slot using a transaction and a partial unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_one_active
ON ai_runs((1)) WHERE state IN ('preparing', 'running');
```

Use a unique request ID constraint and compare the canonical submission hash. Repeat IDs return their existing run. Changed payload under the same ID returns HTTP 409 `request_conflict`. A competing active ticker receives HTTP 409 `ai_busy`; duplicate active same-ticker/same-input submissions reuse the active run.

POST returns 202 for preparing/running, 200 for a terminal idempotent replay. Schedule `execute` only for newly reserved runs using FastAPI `BackgroundTasks`, after committing the reservation. After preparation/capture, reuse a matching successful result unless force is true. Record a new successful reuse run with `reused_from`, `api_call_count=0`, and original summary generation/model/usage metadata; do not present reuse as newly generated content.

GET run returns 200 or 404 `not_found`. GET latest returns a current or outdated saved result, or an explicit null result. `/api/ai/status` exposes configuration and active run ID/symbol without the key. Integrate this with the existing `/api/status` so it no longer claims all explanations are local after enablement.

Startup changes orphaned preparing/running records to interrupted. Neither startup nor GET retries a job. Keep global one-process operation documented. Catch expected preparation/generation errors into terminal records and release the partial-index slot. Terminal API metadata distinguishes unknown delivery from confirmed failures.

- [ ] Add tests for additive migration/restart with existing notes/snapshots, atomic concurrent reservation, request-ID replay/conflict, cache hit/force, SDK call count, job timeout/refusal, startup interruption, previous-success preservation, and state transitions. Use a fake client and a controllable executor so active runs can be observed without waiting on network.
- [ ] Write an idempotency API test with dependency injection:

```python
def test_uuid_replay_keeps_one_run(ai_test_client):
    client, sdk = ai_test_client
    body = {
        "client_request_id": "98496b9c-e5bd-44de-a648-b89e07733032",
        "horizon": "2–8 weeks", "language": "en", "mode": "demo",
        "browser_context": {},
    }
    first = client.post("/api/ai/summaries/DEMO_TREND", json=body)
    second = client.post("/api/ai/summaries/DEMO_TREND", json=body)
    assert first.json()["id"] == second.json()["id"]
    assert sdk.call_count == 1
```

Define `ai_test_client` here with temporary SQLite, offline=False, a dummy enabled config and the Task 3 recording fake; disable external market providers while allowing local demo preparation. FastAPI TestClient can finish the background task before returning, so active-state/concurrency tests must use the controllable executor separately.

- [ ] Add foreign-origin/Host rejection, no-key/offline zero-call, unknown symbol, invalid browser fields, context-too-large zero-call, sanitized errors and GET-never-generates tests. In a generation race test, change caches/notes after capture and assert the result/fingerprint still matches the original context and is subsequently marked changed.
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_ai_jobs.py backend/tests/test_ai_api.py -q`; establish the absent-feature failing baseline.
- [ ] Implement persistent jobs/router/startup recovery. Preserve `create_app(db=None, offline=None)` callers; accept optional test-only AI dependency arguments or use FastAPI dependency overrides.
- [ ] Run `.venv/bin/python -m pytest -q`; verify the full existing backend behavior and new AI coverage pass.

## Task 5: Wire ticker buttons, complete browser context and verify the UI

**Files:** Create `ResearchContext.tsx`, `AiSummary.tsx`, `frontend/tests/ai-summary.spec.ts`, `docs/AI.md`; modify frontend files/locales and `README.md` from the file map.

**Interfaces:**

```typescript
type ResearchDraft = {
  noteDraft?: string;
  thesisDraft?: string;
  sizingForm?: Record<string, string>;
  sizingInput?: SizingInput;
};
type ResearchContextValue = {
  getDraft: (symbol: string) => ResearchDraft;
  updateDraft: (symbol: string, patch: Partial<ResearchDraft>) => void;
  comparisonSymbols: string[];
  setComparisonSymbols: (symbols: string[]) => void;
};
// Export provider + hook from ResearchContext.tsx.
useResearchContext(): ResearchContextValue;
type AiTarget = { symbol: string; horizon: string; language: "en" | "pl"; mode: "demo" | "live" };
// Export AiSummaryButton and AiSummaryPanel from AiSummary.tsx.
```

Mirror backend result/run types and the existing backend `SizingInput` fields in `types.ts`. `AiSummaryPanel` takes target, open/onClose and current data revision; it reads drafts from the provider. `AiSummaryButton` takes symbol, disabled reason, busy and onClick. Keep presentation/job logic in the new module instead of enlarging App with it.

Mount `ResearchContextProvider` above App in `main.tsx`. In `Research.tsx`, initialize notes from saved values only if no in-memory draft exists; register changes immediately. Register thesis text, all sizing form fields and the last successfully calculated sizing input snapshot. Restore the previous sizing result by rerunning the local sizing endpoint with that snapshot on remount, never by inventing result fields. Partial sizing strings survive tab changes and remain explicitly incomplete if invalid. After a successful save, the draft remains the same text; after a successful thesis submission, clear it. Restore registered draft values on remount so what is sent matches what the user sees.

`Workspace.tsx` registers comparison symbols after selection/run. Submit only a distinct 2–4-symbol comparison that contains the target ticker; reconstruct numbers server-side. A late notes-load response must not overwrite a newly edited draft or another ticker's draft.

Watchlist clicks call `openStock(symbol)` and open that symbol's AI panel; heading clicks open the same panel. Create a fresh UUID on Generate/Regenerate, preserve it while awaiting or recovering its submission, and never submit twice from rerenders. Use `force=true` only for explicit Regenerate. Track requests/results by symbol/horizon/language/request ID. Do not auto-generate after changing target settings.

Polling uses the spec's two/five-second cadence and visibility pause; terminal/closed panels stop polling. Reopening checks saved/active local jobs with GET. An unknown POST delivery uses the retained UUID for recovery; it does not create a fresh request automatically. Run IDs and pending request IDs may be kept in localStorage; notes/keys are not added there by this feature.

Extend `api.ts` with an `ApiError` carrying backend `code` and HTTP status while retaining Error-compatible messages for current callers. The job creation/poll requests remain short; do not increase the global browser timeout to match AI inference. Render failure/refusal/incomplete/unknown-delivery states and previous results with their timestamps.

Render the result in the order specified by the design, with accessible status announcements, a heading, keyboard-operable close/action buttons and expandable source/context evidence. Keep the recommendation, outlook, confirmation/invalidation and limitations readable at 390px. Validate cited news URLs against the captured context; render prose as escaped text.

- [ ] Add intercepted-route browser tests before UI implementation. They must not enable backend OpenAI or rely on real credentials. Cover a button in every row, selected-symbol generation, immutable metadata, EN/PL output, error/disabled reasons, loading and recovery, cache reuse, changed-context badges, refusal/incomplete output and sizing/note/thesis drafts.
- [ ] Add the no-background-generation check and a race test that holds MU's response until after the user navigates to another ticker. Assert MU's response never fills that ticker's panel. Repeat for horizon/language changes. For quote expiry, use a controlled clock and assert the outdated state appears without a POST.
- [ ] Add the core per-row/no-auto-call browser test:

```typescript
test("AI appears for each ticker and browsing does not generate", async ({ page }) => {
  let submissions = 0;
  await page.route("**/api/ai/summaries/*", async (route) => {
    if (route.request().method() === "POST") submissions += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
  await page.goto("/");
  const rows = page.locator(".watch-table tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expect(row.getByRole("button", { name: "Summarize with AI", exact: true })).toBeVisible();
  }
  expect(submissions).toBe(0);
});
```

Use schema-valid fixtures from the Task 1 contracts for successful POST/run scenarios. The no-generation test intentionally provides only a GET null response because no POST is expected. Set demo/English settings at test start, as existing workflows do; intercept `/api/ai/status` with an enabled fake public status where needed.

- [ ] Implement shared drafts, both actions, coded API errors, panel/polling and all EN/PL labels. Replace stale “No AI guesswork”/“no AI service” copy with wording that accurately describes the deterministic assessment and optional AI interpretation.
- [ ] Write `docs/AI.md` with environment setup, server restart requirements, current model verification links, full context manifest, stored personal research, billing/usage, offline behavior, limited news evidence, cached-data freshness, failure/recovery and the fact that `store=False` does not guarantee zero retention. Update README's optional-service/privacy sections.
- [ ] Run `npm run build --prefix frontend`, then `npm test --prefix frontend -- --grep 'AI'` so the backend serves the updated bundle. Inspect screenshots at desktop and 390px for the panel, errors and Polish copy.
- [ ] Run `.venv/bin/python -m pytest -q`, `npm run build --prefix frontend`, then `npm test --prefix frontend`. Keep build and browser execution sequential to avoid serving a bundle during mutation.
- [ ] Record actual commands/results and screenshot paths in `docs/AI.md`. No live OpenAI smoke is part of these automated checks. If separately requested, perform one explicit real-ticker request and record only sanitized returned model, completion status and usage.

## Acceptance checklist

- [x] Each ticker row and heading has the requested action, including explicit disabled/setup states.
- [x] One click generates a recommendation, near-term outlook and base/bull/bear horizon scenarios through the configured OpenAI model (verified with fake transport, not a paid live request).
- [x] Context covers every spec category, including tabs never visited, all saved research, and available browser drafts. Its completeness is visible.
- [x] No silent context truncation, unknown evidence IDs, cross-basis trading levels or bypass of existing quality restrictions is accepted; interpretation still requires judgment.
- [x] Jobs survive browser navigation/reload; restart and unknown-delivery errors do not automatically spend more credits.
- [x] Cached results retain original dates and are visibly outdated after source/settings/quote-quality changes.
- [x] Auto-refresh, polling and ordinary navigation create zero AI generation requests.
- [x] English/Polish and desktop/narrow layouts pass the relevant workflows; all existing backend/browser tests and production build pass.

## Planning handoff

This plan delivers the requested feature design and build sequence. Review the default horizon, context categories and prompt before starting product implementation. The implementation can run inline through the five tasks; no new chat, external project or delegated worker is required by this planning request.
