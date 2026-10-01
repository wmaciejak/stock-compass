# Beginner experience, long-term planning and earnings calendar

Status: approved for continuous execution by the user's “do all” instruction. The user selected improvements 1, 3 and 8 from the proposed top ten. The implementation plan is `docs/superpowers/plans/2026-09-30-rookie-investor.md`.

## Purpose and scope

Help a rookie investor understand an analysis, explore regular investing over multiple years, and recognize upcoming earnings risk. Success means a user can complete a first research session without understanding technical abbreviations, inspect how their own savings assumptions and fees change a hypothetical result, and distinguish an estimated earnings date from unavailable information.

The three features share the existing local React/FastAPI workspace, SQLite persistence and ENG/PL interface. They introduce separate components and backend modules rather than expanding the large App component with all new feature logic.

## Approach

Recommended: integrate three small modules into the existing app. Beginner view reuses deterministic analysis; planning uses a separate local calculator; the calendar reads the watchlist's cached event metadata. This supports offline learning and adds no account, AI or paid-data requirement.

Alternatives considered: a separate beginner application would duplicate research and preferences; adding another live event provider would introduce credentials and operational dependencies before the existing estimated dates are presented properly. Both can be revisited if later requirements justify them.

## Navigation and preferences

- Add **Long-term planning / Planowanie długoterminowe** and **Earnings calendar / Kalendarz wyników** to sidebar navigation and the mobile menu.
- Keep `Settings.mode` as `demo | live` and existing technical research horizons as they are. Add `experience: beginner | advanced` and `preferred_workspace: research | long_term` as separate preferences.
- New users start in beginner view. Existing saved settings without the new experience field retain advanced view; the migration is explicit in the service. All users can switch in Settings and restart the guide there. Avoid adding another selector to the crowded mobile top bar.
- Persist guide progress and the last saved planning inputs in separate SQLite key/value records. Store no inferred account balances, holdings or allocation preferences.
- Opening either new page must not require a selected instrument or successful market-data download. Existing startup and auto-refresh remain the owners of live downloads.

## 1. Beginner mode and first-session guide

### First-session guide

Show a nonblocking inline guide in beginner view. It offers **Understand a stock** and **Plan regular investing**, with Back, Skip and Resume. Skipping dismisses the guide; it does not mark the learning steps completed or reopen the guide automatically. Restart is explicit.

The research path has four steps: choose a synthetic example or an existing ticker; read the conclusion and caution; expand the evidence and inspect an indicator explanation; optionally save a research note. A user explicitly marks a step understood before moving on. The planning path has four steps: define a goal; enter a regular contribution; inspect the fee comparison; read an ETF lesson. It can complete offline. Provider errors offer an explicit demo action instead of silently changing data mode.

Progress has a version, selected path, step and state (`active | dismissed | complete`). It survives reload and language changes. Starting or resuming the guide never overwrites research notes or planning inputs.

### Simple analysis overview

Place a compact summary before the chart, especially on mobile:

1. **Conclusion**: the existing assessment label and a plain-language explanation of what the label supports.
2. **Main caution**: a deterministic caution selected by the documented priority below.
3. **Watch next**: the existing next confirmation condition, with explanation of unfamiliar terms available inline.

Show up to three existing supporting facts. Put the chart's technical controls, complete evidence, setup score, detailed weekly context and scenario levels behind **Explore the evidence** disclosures. Existing learning, historical evidence and research/sizing tools remain reachable. Advanced view retains its full layout.

Implement a backend beginner-summary adapter over the existing analysis output, not a second signal engine. Its main-caution priority is: blocked or stale data; known upcoming earnings or unknown event timing; first opposing setup fact; uncertainty fallback when no contrary fact is supplied. The UI calls this a main caution rather than claiming it captures the investor's greatest personal risk. Return structured caution kind and text with the analysis; translate using the existing locale system.

If daily data are not actionable, the beginner summary clearly leads with the data limitation and the repair/verification step. It must not reveal a buy suggestion or actionable scenario hidden by the existing quality restrictions. Synthetic examples remain prominently labeled. Basic guidance works with AI disabled.

## 3. Long-term investing mode

### Planning flow

The new page combines a multi-year savings planner with short ETF lessons. It is separate from chart horizons and technical setup recommendations.

Inputs: optional goal name (up to 100 characters) and target amount (greater than zero, at most 1 trillion currency units); starting amount (0–1 billion units); monthly contribution (0–10 million units); duration of 1–50 whole years; display currency (USD, PLN, EUR or GBP); assumed annual return before ongoing fees (-50% through 50%); annual ongoing fee percentage (0% through 10%). At least one of starting amount and monthly contribution must be positive. All numeric inputs must be finite.

Financial assumptions are entered by the user. A clearly labeled **Load illustrative example** action may populate an example; it does not save it or imply a recommended return. Currency is a unit of display, not an FX conversion. The ongoing fee is separate from the existing trading commission/spread assumptions.

Actions are **Calculate scenario** and **Save plan**. Saving validates and stores the inputs for the local user's next visit. Invalid or unsaved drafts must not overwrite a valid saved plan. Calculation errors are shown by the relevant field or result area.

### Calculation contract

Python owns the calculation. Let `g` be the entered effective annual gross return as a fraction, `f` the entered ongoing annual fee as a fraction, and `c` the end-of-month contribution.

Monthly factors:

- Before fees: `gross_factor = (1 + g) ** (1 / 12)`.
- After fees: `net_factor = ((1 + g) * (1 - f)) ** (1 / 12)`.

For each month, update `gross_balance = gross_balance * gross_factor + c` and `net_balance = net_balance * net_factor + c`. Start both at the entered starting amount. Accumulate contributed money separately. Record year zero and each year end; round only displayed amounts.

This is a disclosed constant-return and proportional-fee approximation. The difference between the two paths is **fee impact including foregone growth**, not a claim about actual fees debited by a broker. Returns may be negative. The example does not model taxes, inflation, transaction costs, FX movement or market-price paths; describe these limits in one concise assumptions disclosure. Do not add market probabilities or label a scenario as expected performance.

Results show total contributed, hypothetical ending value after fees, hypothetical growth/loss, fee impact, and distance from an optional target. A chart compares contributed money, value before fees and value after fees, with an accessible annual-value table. Changing inputs requires recalculation and visibly marks existing results out of date.

### ETF learning

Include short English/Polish lessons on what an ETF owns, broad versus narrow diversification, index tracking, ongoing fees, distributions/reinvestment and currency exposure. Link to verified Investor.gov resources. The material is educational and does not rank funds or select investments for the user. Actual instrument research retains the app's existing US-listed USD support; choosing PLN display currency does not imply additional exchange coverage.

## 8. Watchlist earnings calendar

### Scope and display

The initial calendar covers company earnings, the event type already present in the provider metadata. Use a chronological agenda with 30-day and 90-day windows rather than a cramped mobile month grid. Dates today are included. Each row shows instrument, event type, date or date range, an **Estimated** text badge, source label and original retrieval time.

A visible section lists instruments with unknown or unverified dates. Verified ETFs show **Company earnings do not apply**. Synthetic instruments show **Synthetic example: no company earnings**. CSV imports with unverified identity show unknown information. An empty dated agenda must never imply there is no earnings risk.

Use one structured event presentation in the watchlist, company context and calendar. Replace the watchlist's current date extraction from the `event_risk` text, which loses the estimated qualifier.

### Provider and date semantics

The current Yahoo metadata adapter only supports estimated dates. Every date it supplies remains estimated; do not manufacture a confirmed badge. A future provider can add confirmed status only with explicit confirming evidence, which is outside this release.

Preserve valid `earningsTimestamp`, `earningsTimestampStart` and `earningsTimestampEnd` candidates. A past timestamp must not mask a valid upcoming range. Normalize Unix instants into date-only labels in the verified exchange timezone, retain the range and source timestamps, and disclose that a precise announcement time is unavailable. Include same-day events even if their timestamp has already passed. Invalid/reversed ranges become unknown, not repaired guesses.

Legacy cache entries contain only a previously UTC-derived date without the source timestamp. Keep that date as last-reported unverified information in the unknown/unverified section until an ordinary refresh replaces it; do not relabel it as a verified exchange-local date. Frontend rendering treats date-only strings as calendar labels, following the existing UTC date-formatting convention, so the browser timezone cannot shift the displayed day.

### Data flow and freshness

Add a cache-only calendar endpoint, filtered by validated `demo | live` mode and a 30/90-day window. Read instrument identity and event context directly from cache; avoid indicator calculations or extra provider calls. Return an entry/status for every matching watchlist instrument, including symbols without cache.

Mark metadata older than 24 hours as **Needs refresh** while retaining its original timestamp. Missing, malformed or future retrieval timestamps have unknown freshness. This threshold is a product freshness cue, not a guarantee about event accuracy. A failed refresh preserves the last reported estimate with a separate cached/refresh-failed warning. Past dates leave the upcoming agenda and move to unknown/needs-update status. Known upcoming dates outside the chosen window remain known in the coverage section rather than being classified as missing.

Existing manual or automatic watchlist refresh updates the metadata. Calendar display reloads after watchlist changes, mode changes and the app's data revision. The calendar itself never starts a second bulk download. Offline mode continues showing cached estimates with freshness labels. No notification scheduler is added by this feature.

## Components and API boundaries

Frontend: new `BeginnerGuide.tsx`, `BeginnerSummary.tsx`, `LongTerm.tsx`, `Events.tsx` and a small shared earnings-status component. App owns navigation and integration; Settings owns preference controls; charts, locale formatters and reusable card styles remain shared.

Backend: focused beginner-summary, planning and event-normalization modules, Pydantic request/response models and routes in the existing API. Use the existing Store for preferences/progress/last saved plan. Proposed boundaries:

- Existing settings GET/PUT extended with experience and preferred workspace.
- `GET/PUT /api/onboarding` for progress.
- `POST /api/planning/scenario` for calculation; `GET/PUT /api/planning/plan` for the saved plan. An unsaved plan GET returns null.
- `GET /api/watchlist/events?mode=demo|live&window_days=30|90` for cached watchlist events. Return generated time, mode, offline state, freshness threshold and one coverage row per symbol. Rows include stable status/reason codes, date/range, date basis, source, original retrieval time and a separate refresh-error field.

All mutations retain local-origin checks. Legacy settings, analysis snapshots and daily caches remain readable. Preserve or jointly update the existing analysis consumer of `context.earnings.data.date` while adding structured ranges. Existing exports and AI summaries must tolerate the additional beginner/event fields without inventing a multi-year market forecast. Malformed earnings metadata must not fail an otherwise valid price download.

## Verification and acceptance

Backend tests must check independent arithmetic examples, zero-return contributions, zero-fee equality, negative returns, end-of-month timing, fee impact, input rejection and save/load round trips. Settings tests cover new-user defaults and existing-settings migration. Beginner-summary tests cover data restrictions and the deterministic caution priority.

Event tests use frozen clocks and seeded metadata: estimated dates and ranges, same-day inclusion, stale/past dates, invalid timestamps, an old exact timestamp with a future range, exchange-timezone boundaries, legacy cache, refresh failure, no cache, ETFs, CSV and demo. Assert that opening the calendar makes no provider call.

Browser workflows cover both onboarding paths, skip/resume/restart, advanced disclosures, saved planning inputs, stale-result indicators, fee comparison, event ordering/statuses and data-revision updates. Test ENG/PL and a 390×844 viewport; verify readable text, keyboard controls and no horizontal page overflow. Existing chart/AI/horizon workflows explicitly select advanced view where they test that interface. Screenshots verify the new layouts.

Run the backend suite, production frontend build and relevant Playwright workflows. After targeted checks pass, run the existing regression suite once. Live provider availability is a separate smoke check and cannot substitute for deterministic tests.

## Source grounding

- [Investor.gov compound-interest calculator](https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator): supports the planning input categories; the calculation method above is this app's explicit approximation.
- [Investor.gov understanding fees](https://www.investor.gov/introduction-investing/getting-started/understanding-fees): supports teaching the long-term effect of fees.
- [Investor.gov ETF overview](https://www.investor.gov/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2): supports the educational ETF topics.

## Delivery boundary

This workspace is not currently a Git repository, so the design is saved without a commit. The user authorized the complete selected scope. Implementation order is shared models/preferences, beginner experience, planning calculation/UI, calendar normalization/UI, then combined regression and visual verification. Source snapshots and verification records replace Git-specific execution bookkeeping.
