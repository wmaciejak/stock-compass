# Stock Compass Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline execution. User requested continuous execution.

**Goal:** Build and inspect a functioning local research application using real library calculations.
**Architecture:** Python owns market facts and rules; React consumes typed JSON. SQLite keeps native data and personal research. One local service serves the app.
**Tech Stack:** Python 3.12, FastAPI, pandas, NumPy, TA-Lib, yfinance, Backtesting.py, exchange calendars, React, Lightweight Charts.
**Spec:** docs/superpowers/specs/2026-09-30-stock-compass-design.md (and full user brief).

## Global Constraints
- No invented real-ticker values. Demo symbols must start DEMO_.
- Completed sessions only; no silent data repair, engine or provider switching.
- No logins, purchases, cloud publication, AI service or broker execution.
- Persist locally; keys never enter client bundles.

## Review Focus
- Short/flat history and absent volume suppress unsupported signals.
- Interior gaps, unknown CSV basis and stale cache block scenarios and backtests.
- Later bars must not revise earlier causal rules or swing levels.
- Next-open fills and gapping stops must follow the installed engine.
- Browser failures preserve usable navigation and disclose limitations.

## Task 1 — Phase A: data and local vertical slice
- [ ] Establish lockfiles and install wheels; inspect installed APIs.
- [ ] Write tests for normalization, provider shape/errors, freshness and SQLite before implementation; observe initial failure.
- [ ] Implement models.py, providers/, normalization.py, persistence.py and service.py.
- [ ] Add deterministic calendar-based fixtures, local startup supervisor and API.
- [ ] Verify tests and demo/live API smoke tests.

## Task 2 — Phase B: analysis and learning
- [ ] Write indicator warm-up/reference, flat/short, missing-volume and causal prefix regression tests; observe failure.
- [ ] Implement indicators.py, rules.py, explanations.py and analysis.py.
- [ ] Add typed assessments, conservative scenarios, weekly context and benchmark alignment.
- [ ] Build watchlist, stock detail, indicator charts and metric explanations.
- [ ] Verify calculations and browser rendering.

## Task 3 — Phase C: historical evidence and workflow
- [ ] Write strategy consistency, zero-trade, gap-stop and sizing tests; observe failure.
- [ ] Implement backtests.py using canonical rules, costed baseline, holdout and chronological periods.
- [ ] Implement snapshots, notes/journal, sizing and exports.
- [ ] Build research workflow views and comparison.
- [ ] Verify tests, persisted API state and exports.

## Task 4 — Phase D: polish and final verification
- [ ] Finish CSV preview/import, optional provider context, onboarding and status page.
- [ ] Document data/rules/licenses and provider investigation with current official links.
- [ ] Run pytest, typecheck/build and fixed-fixture browser workflows.
- [ ] Inspect desktop and narrow screenshots; run separate live-data smoke.
- [ ] Request fresh whole-app review, fix important findings and rerun affected checks.
