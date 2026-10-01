# Stock Compass

A local workspace for learning stock analysis. React charts are backed by real TA-Lib calculations, versioned causal rules, Backtesting.py simulations, and SQLite. No login, broker account, cloud deployment, AI key or paid data subscription is required for the core app.

Clone the repository before setup:

```bash
git clone git@github.com:wmaciejak/stock-compass.git
cd stock-compass
```

## Start on your Mac

Prerequisites: Python **3.12** and Node.js **20+** with npm. Node **24** is selected in `.nvmrc` and CI; `.python-version` selects Python 3.12. For Homebrew users: `brew install python@3.12 node`. Installation needs internet access; the installed demo runs offline. The setup and launcher scripts also work on Linux.

From this directory, run the setup command once:

```bash
./scripts/setup.sh
```

Then start:

```bash
./scripts/start.sh
```

Open **http://127.0.0.1:8765**. Stop with **Ctrl+C**. The supervisor stops its child service. If the port is occupied, it explains how to choose another: `STOCK_COMPASS_PORT=8766 ./scripts/start.sh`. Docker is not needed.

`requirements.lock` pins the Python environment; `frontend/package-lock.json` pins npm dependencies. Setup installs TA-Lib from a binary wheel with its C library bundled. Source checkouts do not include installed dependencies or the built frontend; the setup command creates both.

Use **ENG / PL** in the top bar to switch between English and Polish. The choice is saved locally and applies to navigation, explanations, learning panels, research tools and Markdown reports. Switching languages does not download prices or change calculation results. Company names, sourced news and your own notes retain their original text; CSV headers stay stable.

The top-bar **Auto-refresh** selector offers Off (default), 1, 5, 15 or 30 minutes. The preference is stored in this browser locally. Opening or reloading the site requests fresh daily data for every watchlist instrument and the benchmark. Each later timer interval does the same on any app page; a visible 1H chart also refreshes its hourly data. The first timed run waits a full interval after load. Hidden tabs pause automatic downloads; scheduled runs do not overlap. Watchlist rows show their source retrieval times. Manual refresh remains available. If an external provider is unavailable, cached data retain their original timestamp and quality restrictions. Daily analysis values change when the provider supplies new or revised completed bars; a current-session quote can change intraday. Neither has guaranteed real-time delivery. Refreshing a large watchlist at one-minute intervals may run into the provider's rate limits.

During an open US session, the live watchlist and stock heading show a **current-session provider quote** and its change from the provider's previous close, both labeled provisional with an as-of time. This quote may be delayed and is shown only while it is recent and within a regular trading session. The completed daily close and date remain visible beside it. Technical labels, benchmark research, conditional levels and backtests still use completed daily bars. Demo and daily CSV imports have no current-session quote. If a quote is missing, old or its refresh fails, the display falls back to the labeled completed daily value.

## Beginner view and planning

New installations start in **Beginner** view. **Settings & data → Experience** switches between Beginner and Advanced; saved settings from older installations retain Advanced. **Preferred workspace** chooses whether startup opens stock research or long-term planning, independently of Demo/Live mode and research horizon. Both new pages are in the sidebar and the mobile navigation menu.

The beginner guide offers **Understand a stock** and **Plan regular investing**. Mark each step understood, go Back, Skip, or Resume later; **Restart beginner guide** is explicit in Settings. Progress survives reload and ENG/PL changes without changing saved notes or plans. Stock overviews lead with Conclusion, Main caution and Watch next. **Explore the evidence** opens the charts and technical details; the learning, backtest and research tabs remain available. The guide and explanations work with AI disabled.

**Long-term planning** calculates a hypothetical savings scenario from your own starting amount, monthly contribution, whole years, assumed gross annual return and ongoing annual fee. Give the goal an optional name/target. **Load illustrative example** fills a draft; **Calculate scenario** shows results and **Save plan** persists inputs locally. Edited results are marked for recalculation, and invalid drafts do not overwrite a valid saved plan. USD/PLN/EUR/GBP label amounts without converting currencies or expanding the instrument research coverage.

Python applies the effective annual return and proportional fee as monthly growth factors, then adds each contribution at the end of the month. Only displayed amounts are rounded. The chart and keyboard-scrollable annual table compare contributions and values before/after fees. Chart ticks use compact or scientific amounts to remain readable; the caption labels the currency and the table retains full displayed amounts. **Fee impact including foregone growth** is the difference between those paths. Returns may be negative. This constant-return approximation excludes taxes, inflation, transaction costs, FX movement and changing market prices; it assigns no probabilities or expected performance. ETF lessons explain holdings, diversification, index tracking, ongoing fees, distributions/reinvestment and currency exposure, with Investor.gov links.

## Cached earnings calendar

**Earnings calendar** shows 30-day or 90-day company earnings estimates for the current mode's watchlist, including same-day events and date ranges. All current provider dates are **Estimated**, with exchange-local calendar dates, source and original retrieval time; precise announcement time is unavailable. Opening the calendar or changing its window only reads cached metadata. Existing manual/startup/automatic watchlist refresh remains responsible for downloads.

Coverage keeps unknown dates visible, identifies verified ETFs and synthetic examples as not applicable, and keeps known dates outside the window separate. Legacy dates derived from UTC remain unverified until a normal refresh; imported identities can also be unverified. Metadata older than 24 hours needs refresh, malformed/missing/future retrieval times have unknown freshness, and failed refreshes retain cached information with a warning. Offline mode can show cached coverage. An empty agenda does not establish absence of earnings risk, and freshness does not guarantee event accuracy.

## First research session

1. Start in the **Synthetic demo workspace**. DEMO_TREND and DEMO_VOLATILE are fictional instruments. Refresh the watchlist, open a stock and explore its reasoning. Add DEMO_RANGE to try another fixture.
2. Switch to **Live research** for the editable starter list MU, TSM, VST and LULU. Open one or refresh the watchlist to download external prices through the unofficial yfinance adapter. These are examples to investigate, not predefined buys.
3. Read the overview and next confirmation condition. Indicators & learning explains readings and common mistakes. Historical evidence runs either fixed strategy with editable costs against a matching buy-and-hold baseline.
4. Use Research & sizing to keep notes, save an idea and snapshot, enter your own sizing inputs, and export Markdown or CSV. Record the idea's outcome later in the journal.
5. Compare up to four instruments over matching session dates. The default live benchmark is SPY; change it in Settings & data.
6. Choose a research horizon: 1–2 weeks, 2–8 weeks, 1–6 months or 6–12 months. The overview explains what each supports; backtests remain fixed daily strategies. Chart windows include 1W, 2W and 1M for shorter views. The Resistance / Opór checkbox shows zones when checked and removes them when unchecked, while keeping support and analysis intact.
7. Select **Daily / 1H** above the detail chart for actual hourly candles. EMA 20 and the other chart indicators then use hourly bars. Independent **Support / Wsparcie** and **Resistance / Opór** checkboxes show their zones when checked, on either interval. Hourly data have a separate cache and refresh control; daily recommendations, strategy results and exports remain daily. Read the [hourly chart conventions](docs/HOURLY.md), including the limited history and unverified corporate-action basis of live hourly prices.

Real prices need an external provider. yfinance is **not an official Yahoo integration**, does not guarantee service or real-time data, and is used here for personal research. Missing data never become synthetic real-ticker values. Data quality is evaluated against US equity sessions and a two-hour publication allowance; stale or critically incomplete data block action labels and strategy results.

## CSV and offline use

Settings & data offers file validation and a preview before explicit import. Required columns:

```csv
Date,Open,High,Low,Close,Volume
2026-09-28,100,102,99,101,1000000
2026-09-29,101,103,100,102,1200000
```

These two rows illustrate the format only, not a real instrument. Provide the symbol, name, US exchange, USD currency, and OHLC adjustment convention. Unknown or unadjusted basis allows inspection but blocks actionable analysis/backtests. Fewer than 200 sessions limits scope; at least 220 are needed for simulation. Split-only CSV returns exclude dividends. Imported identity is user-declared, not provider-verified. An import explicitly replaces the whole source series; it never stitches providers. Built-in demo fixture names cannot be overwritten.

For a synthetic CSV use a new **DEMO_** name. For real symbols supply actual price history. Set `STOCK_COMPASS_OFFLINE=1` in an optional `.env` (copy `.env.example`) to disable external downloads while retaining CSV, demo and cached history. Demo always uses the synthetic DEMO_MARKET benchmark, never invented SPY prices. Its fixture ends on September 29, 2026 and is a fixed historical laboratory, exempt from live freshness, with the date displayed.

## Persistence and privacy

SQLite: `data/compass.sqlite`. It keeps watchlists, settings, guide progress, saved planning inputs, user notes, raw provider frames, context, analysis snapshots, journal entries, rule versions and backtest configurations/results. Restarting preserves them. Back up this file with the app stopped. Removing a watchlist item does not delete research records. No personal account size is inferred; the optional calculator only uses values you enter. Core assessments are deterministic and local.

Optional **Summarize with AI** buttons in ticker rows and stock headings use **gpt-6-luna** for an evidence-based recommendation and conditional outlook. Enable with `OPENAI_API_KEY` and `STOCK_COMPASS_AI_ENABLED=1` in `.env`, then restart. An explicit generation sends the ticker's market context, saved research and available drafts/sizing inputs to OpenAI and uses your API quota. Captured context and results are saved locally. The service is disabled by default and in offline mode; ordinary navigation and auto-refresh never generate AI summaries. Read the [AI setup, context, billing and recovery conventions](docs/AI.md).

Backend environment settings stay in `.env`; no provider keys enter frontend bundles or exports. Both services bind to loopback; production uses one port. Mutating API requests reject foreign browser origins and the backend restricts Host headers. This is a single-user local app, not a multi-user internet service.

## Verification

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
npm test --prefix frontend
```

Browser tests start a separate offline service on port 8767 and use a fresh database in the operating system's temporary directory for each invocation. Installed Google Chrome is used on macOS when present; other environments use Playwright's Chromium. Install it before the first browser run:

```bash
cd frontend
npx playwright install chromium
cd ..
```

On Linux, `npx playwright install --with-deps chromium` also installs system dependencies. Set `COMPASS_CHROME` to a Chromium executable or `COMPASS_TEST_DB` to an explicit disposable database path when needed. Browser tests keep AI disabled and clear the API key. Tests cover ticker persistence, chart controls with no new provider request, both strategies, learning panels, journal, sizing, exports, CSV and provider errors. Screenshots are in `docs/screenshots/`.

The AI output contract verification passed **216 backend tests**, **62 browser workflows** and the production build. [The verification record](docs/VERIFICATION.md) documents checks and limits. The AI workflows use controlled responses and make no paid calls. Tests use disposable databases and do not seed saved user research. Local agent logs and source snapshots are excluded from Git.

GitHub Actions runs the locked setup, backend suite, production build and browser suite on Ubuntu for pushes to `main` and pull requests. It uses Python 3.12, Node 24, an isolated database, offline market data and disabled AI. Git contains source, reproducible fictional fixtures, lockfiles, documentation and demo screenshots. `.env`, the entire `data/` directory, dependency folders, generated builds and local agent records are ignored. See [contribution instructions](CONTRIBUTING.md) and [repository preparation](docs/GITHUB.md).

With the normal app running, `.venv/bin/python scripts/smoke_live.py` performs a **separate real-data check**, records `docs/live-smoke.json`, and fails on an outage. It never counts a fixture as live success.
Run `.venv/bin/python scripts/smoke_hourly.py` for the separate MU/SPY hourly check, recorded in `docs/live-hourly-smoke.json`.

## Read the conventions

- [Data conventions](docs/DATA.md): native data, adjusted prices, sessions, cache and unavailable states.
- [Strategy rules](docs/RULES.md): exact causal definitions, sizing, execution, gaps and evaluation.
- [Provider investigation](docs/PROVIDERS.md): current free-plan limitations and licensed extension point.
- [Optional AI summaries](docs/AI.md): configuration, full context, model, billing and saved-result recovery.
- [Dependency licenses](docs/LICENSES.md), [TradingView notice](NOTICE).
- [Implementation checklist](docs/PROGRESS.md).

The heuristic assessment is research triage, not a profit probability or personalized suitability recommendation. Historical performance is not a forecast. The app can validly conclude that no current candidate qualifies. Adjusted-price simulation is an economic research approximation, not a reconstruction of historical executable dollar prices.
