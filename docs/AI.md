# Optional AI ticker summaries

Every watchlist row and stock heading has **Summarize with AI / Podsumuj z AI**. An explicit click captures the selected ticker, workspace, research horizon and interface language. The result gives a recommendation, the next 1–5 trading sessions, base/bull/bear scenarios for the selected horizon, confirmation and invalidation conditions, evidence, counterarguments and missing context.

The app uses **`gpt-6-luna` with high reasoning**, following the October 1 request for a cheaper model. This is a fixed default, with no automatic model upgrade or fallback. The [official model reference](https://developers.openai.com/api/docs/models/gpt-6-luna) confirms a 922,000-token maximum input, Responses API and structured-output support. The backend uses the official OpenAI Python SDK, pinned to 2.54.0 in `requirements.lock`, and the [Responses structured-output interface](https://developers.openai.com/api/docs/guides/structured-outputs). The specialized instructions are in [prompt.md](../backend/compass/ai/prompt.md).

## Enable it

The feature is optional and disabled by default. Add these settings to the project-root `.env` without replacing existing local settings:

```dotenv
OPENAI_API_KEY=your-api-key
STOCK_COMPASS_AI_ENABLED=1
STOCK_COMPASS_AI_MODEL=gpt-6-luna
STOCK_COMPASS_AI_REASONING=high
STOCK_COMPASS_OFFLINE=0
```

Create an API key in your OpenAI Platform account with access to the configured model and available API quota. Stop the running local app with Ctrl+C, start it with `./scripts/start.sh`, and reload the browser. Settings & data displays availability and the configured model. A ChatGPT/Codex subscription does not supply this app's API key. The key stays in the backend environment and is absent from status responses, browser bundles, prompts and exports.

Optional controls, with their defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `STOCK_COMPASS_AI_MAX_OUTPUT_TOKENS` | `12000` | Maximum generated output, including reasoning |
| `STOCK_COMPASS_AI_TIMEOUT_SECONDS` | `240` | Single OpenAI request timeout |
| `STOCK_COMPASS_AI_MAX_CONTEXT_BYTES` | `2000000` | Complete serialized context budget; oversized input is rejected before calling OpenAI |
| `STOCK_COMPASS_AI_MAX_REQUEST_TOKENS` | `190000` | Exact counted input plus maximum output allowance; requests exceeding this budget are blocked before generation |

Changing the model or reasoning setting requires a restart. An unavailable model produces an explicit error; the app does not switch models. Offline mode prevents AI requests even when a key is configured. Demo summaries still require internet and use explicitly fictional historical evidence.

## What the click sends

The backend prepares missing supported data, then freezes the relevant SQLite records. It builds an immutable context from that capture. It uses existing cached source dates and freshness restrictions; it does not silently refresh all market data or run new backtests.

The context includes:

- Instrument identity, provenance, quality restrictions and supported/missing provider context.
- All available completed daily bars and indicator values, completed weeks, zones, assessment, horizon profile and the current daily scenario.
- The benchmark's available daily analysis/history and benchmark-relative evidence.
- A still-usable current-session quote with its time, provisional status and provider-native basis; expired quotes are unavailable.
- Available completed hourly bars, indicators, zones and quality, with their separate interval and price basis. Daily CSV imports explicitly lack hourly data.
- Available fundamentals, earnings/events and provider news titles/links. Full news articles are not fetched or implied.
- Both saved strategy results/configurations, including full saved result data and stale-result labels. Unrun strategies are explicitly unavailable.
- This ticker's saved note, journal entries/outcomes and all saved analysis snapshots. Historical snapshots keep their original dates and provenance.
- The in-memory note and thesis drafts available at click time, including a deliberately cleared note. Drafts survive app tab/ticker navigation during the current browser session.
- Current sizing form strings and the last successfully calculated sizing inputs, with the calculator result recomputed locally. Partial form values are preserved as incomplete input rather than guessed.
- Workspace settings and watchlist summaries, plus a selected comparison involving this ticker, recomputed from cached analyses when available.

Research notes/journals for unrelated tickers, backend secrets, environment variables and previous AI prose are excluded. Long time-series tables share named columns and series references; repeated values are run-length encoded, and evidence metadata is grouped without changing reference IDs, paths, intervals or price bases. Every historical price bar, timestamp and OHLCV value is retained. Unavailable categories and price-history row/date counts appear in the expandable context manifest.

**AI transport policy:** Following the October 1 request to minimize token usage, each daily/hourly/benchmark or saved-snapshot history sends all original price bars in `bars`, with derived indicators separately in `indicator_history` for the **latest 32 completed bars**, rounded to **6 decimal places**. Older derived indicator values are omitted from the request. Current metrics, trading levels, strategy results, notes and other research retain their original precision. App calculations and the saved original context retain the full indicator history. English/Polish disclosure and encoding metadata describe the policy. The v4 prompt explains the separate tables and indexed evidence selections. Prompt/encoding versioning distinguishes new requests from earlier requests.

The model receives the specialized instructions separately from the evidence. Notes and provider text are treated as data. Structured results must match the requested ticker/horizon/language and refer to known captured evidence. Numeric levels must match their cited source, interval and price basis. Entry/stop/target roles must come from the current daily scenario. Restricted daily quality requires an insufficient-data result. These checks constrain the output; they do not verify every interpretation in the generated prose.

The generation schema now enforces those structural choices before the response is produced. Each evidence group includes `first_source_index`; a source's integer index is that offset plus its position in the group's reference list. Claims select nonempty lists of valid indexes. The schema fixes instrument/horizon/language, requires base/bull/bear scenario objects and restricts recommendations using the captured daily quality and presence of a daily scenario. Levels select a permitted source and role instead of repeating floating-point values. The backend restores original reference IDs and exact prices, intervals and bases from frozen evidence, then runs the existing validation checks. Hourly prices remain provider-native observations; they cannot become daily execution levels. Prompt/encoding v4 and schema v2 distinguish these requests. The public result format and older saved summaries remain compatible. A request with more than 900 eligible price-level sources is rejected locally before counting or generation because of the provider schema enum limit; all context remains stored.

The backend receives the typed response envelope before validating generated JSON locally, using the same native strict schema as the preflight count. An output validation failure now records a safe rule and field, plus a bounded response ID and token counts when available. The English/Polish panel explains the rejected rule without displaying model prose or raw provider errors, and never retries automatically. Earlier saved failures lack that detail; their discarded response and exact failed check cannot be recovered. Structured output constraints do not prove that the model's interpretation of cited evidence is correct; see [OpenAI's guidance on remaining mistakes](https://developers.openai.com/api/docs/guides/structured-outputs#handling-mistakes).

## Billing, persistence and recovery

An explicit generation sends context to OpenAI and can incur API charges on your account. Ordinary navigation, market auto-refresh, job polling and opening a saved current result do not generate summaries. Usage metadata records the returned model, response ID, input/output token counts, source dates and original generation time. Qualitative confidence describes evidence strength, not a calibrated forecast probability.

On October 1, [OpenAI standard pricing](https://developers.openai.com/api/docs/pricing) lists GPT-6 Luna's long-context rates (>272,000 input tokens) at **$0.20 per million input tokens and $0.75 per million output tokens**, compared with GPT-6.1 Sol's $4.00 and $15.00. That is 20× lower per-token pricing while retaining the complete context. For the previously measured 456,643 input tokens and up to 12,000 output tokens, estimated standard token charges are approximately **$0.10–$0.13**, including the possible 1.25× cache-write input rate. Actual charges depend on input/output usage, caching and the account's processing tier or regional premiums. Existing saved summaries retain their original model and usage; new requests use Luna, and configuration fingerprints distinguish the models.

Only one AI job runs at a time in this single-process local app. A persisted request UUID makes repeated submission of identical input idempotent. Matching complete context/configuration can reuse a saved success without another API call. **Regenerate** explicitly creates a new forced request and may incur new charges.

Before an uncached generation, the live SDK uses OpenAI's [input token-count endpoint](https://developers.openai.com/api/docs/guides/token-counting) with the actual messages, model, reasoning and strict output schema. Counted input plus the configured maximum output must fit the **190,000-token request budget**, chosen below the observed 200,000-token Luna throughput limit. An oversized request or failed count stops before generation; its persisted generation-attempt count remains zero. The budget is configurable and does not reserve capacity or replace the provider's current available-token limit. Cached-result reuse, navigation and job polling do not count or generate again.

SQLite stores the captured context, personal research included in it, result, metadata and job state. Back up `data/compass.sqlite` with the app stopped. Browser storage holds recovery IDs; this feature does not put drafts or keys in localStorage. New AI tables are additive and do not replace existing research records.

Closing the panel or navigating away leaves an accepted backend job running. Reopening resumes it or displays the saved result using read-only requests. A source, quote-quality, settings or browser-draft change marks a saved result as outdated; updating it requires an explicit generation action.

The SDK has automatic retries disabled. Authentication, quota, refusal, incomplete output and malformed evidence produce explicit failures while preserving the last successful summary. A timeout/connection failure can mean **delivery unknown**: OpenAI may have received and billed the request. Reopening a known uncertain job does not submit it again; choose Regenerate explicitly if you want another attempt. A browser submission whose acknowledgement was lost retains its UUID for recovery. A backend restart marks unfinished jobs interrupted and does not resubmit them.

HTTP 429 can represent exhausted API credits, an organization/project spending limit, an approved organization usage limit, or request/token throughput. The app now inspects the SDK's structured code/type and saves the specific recognized cause with English/Polish guidance and links to [billing](https://platform.openai.com/settings/organization/billing), [API limits](https://platform.openai.com/settings/organization/limits) and [project settings](https://platform.openai.com/settings/). Unrecognized responses remain explicitly unknown; raw provider messages and secrets are not displayed. Earlier saved `rate_limited` failures discarded this detail and cannot be reclassified retrospectively. Check the account/project owning the configured key. Waiting or repeatedly regenerating does not restore exhausted credits or spending/usage limits; a request that exceeds a token-throughput limit can also need a higher limit. See the [official OpenAI error guide](https://developers.openai.com/api/docs/guides/error-codes#api-errors).

Requests use `store=False` and no web or other model tools. This disables Responses application-state storage; it does **not** guarantee zero retention. OpenAI's applicable API data controls and abuse-monitoring rules still apply. See [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data).

`store=False` also disables saved response objects in the OpenAI Responses dashboard logs, as described in [conversation state](https://developers.openai.com/api/docs/guides/conversation-state#passing-context-from-the-previous-response). An empty Responses logs page does not establish whether a request reached the API. The local app persists the run and its sanitized failure independently.

New HTTP 429 failures include **Request diagnostics** in the panel. When available, these retain the OpenAI request ID, numeric request/token/project limits and remaining allowances, reset durations, and a numeric Retry-After delay. Input context bytes and configured maximum output tokens are recorded separately; bytes are not token counts. A recognized TPM error may also supply requested/used token counts: only those numbers are extracted, never the raw provider message, organization IDs, credentials or research text. A request exceeding the entire token limit is explicitly distinguished from temporary exhaustion; waiting alone cannot make the same oversized request fit. Historical failures lack provider diagnostics and cannot recover them retrospectively. See [rate-limit response headers](https://developers.openai.com/api/docs/guides/rate-limits#rate-limits-in-headers). Storage and model settings remain unchanged, and diagnostics do not initiate retries.

## Verification

All automated AI generation checks use controlled fake responses or intercepted local browser routes. Backend coverage includes immutable full context, typed price evidence, quote/daily-quality expiry, budget rejection, actual SDK serialization/parsing through a fake HTTP transport, invalid/refused/incomplete results, UUID concurrency/cache reuse, terminal recovery and backend-only keys. Browser checks cover ticker buttons, no background generation, cleared notes and partial sizing drafts, returned model, Polish results/errors, stale-result and lost-acknowledgement recovery, ticker/horizon/language races and the narrow panel.

October 1 compact-transport verification: **62 affected backend tests passed**, all **17 AI browser workflows passed**, the TypeScript/Vite build passed, and the complete captured MU payload decoded correctly under the approved precision policy, preserving 1,513 daily bars, 1,513 benchmark bars, 288 hourly bars and 1,506 evidence references. A real [OpenAI token-count call](https://developers.openai.com/api/docs/guides/token-counting), without model generation, measured **456,643 input tokens** for the final prompt/schema/context; adding the configured 12,000-token output allowance gives **468,643**, below the observed 500,000-token limit. Serialized context fell from 1,846,161 to 984,144 bytes. Larger future captures can still exceed API limits; the byte cap does not guarantee any account's token allowance. No live summary generation was initiated during verification.

Final September 30 check: **87 backend tests passed in 148.69 seconds**, **26 browser workflows passed in 1.4 minutes**, and the TypeScript/Vite build passed. `pip check` reported no broken requirements. One read-only review identified price-evidence and recovery gaps; reproducing tests failed before those fixes and passed afterward. The local service restarted successfully with existing research/settings preserved and AI disabled because no key is configured. Existing dependency warnings and the Vite bundle-size advisory remain.

Run:

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
npm test --prefix frontend
```

Build before browser testing so the separate offline server serves the current bundle. Final counts and limits are recorded in [VERIFICATION.md](VERIFICATION.md). Inspected fixture screenshots: [desktop](screenshots/ai-desktop.png), [390px view](screenshots/ai-narrow.png), [narrow scenarios](screenshots/ai-narrow-scenarios.png). They illustrate rendering, not a live model's analytical quality. Live API availability and output quality have not been tested with a real key.
