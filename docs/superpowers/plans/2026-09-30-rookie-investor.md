# Rookie Investor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver beginner onboarding, multi-year savings planning and a watchlist earnings agenda in Stock Compass.

**Architecture:** Reuse the deterministic research engine and add small Python modules for beginner summaries, planning arithmetic and earnings normalization. Add focused React components, with App owning navigation and shared data revisions. SQLite key/value records persist preferences, onboarding progress and the last saved plan.

**Tech Stack:** Existing Python 3.12/FastAPI/Pydantic/SQLite and React/TypeScript/Vite/Playwright; no added dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-rookie-investor-design.md`

## Global Constraints

- Keep `Settings.mode` as `demo | live` and existing technical research horizons as they are.
- Add `experience: beginner | advanced` and `preferred_workspace: research | long_term` as separate preferences.
- New users start in beginner view. Existing saved settings without the new experience field retain advanced view.
- Python owns the calculation. Contributions happen at the end of each month; round only displayed amounts.
- Planner inputs: initial 0–1 billion, monthly 0–10 million, years 1–50 integer, gross annual return -50%–50%, annual fee 0%–10%, optional target >0 and <=1 trillion, goal name <=100 characters, currency USD/PLN/EUR/GBP. All numeric inputs must be finite, and initial or monthly must be positive.
- Current provider earnings dates are estimated. Unknown coverage remains visible; legacy UTC-derived dates remain unverified until normal refresh.
- The calendar itself never starts a second bulk download. Respect demo/live separation, offline mode and original source retrieval timestamps.
- English/Polish, keyboard access and 390×844 mobile layouts are required. Basic guidance works with AI disabled.
- Do not modify the user's database or .env to seed examples. Tests use disposable databases and deterministic fixtures.
- This directory has no Git repository. Record source snapshots, task reports and verification in `.superpowers/sdd/2026-09-30-rookie-investor/`; no Git initialization, commits or worktree creation.
- The user's “do all” authorizes end-to-end execution of selected features 1, 3 and 8 without additional intermediate approval prompts.

## Review Focus

1. Editing a planner input while a request is in flight must not make an old response appear current or overwrite a newer draft; Task 2 tests pin this.
2. Partial persisted settings and old snapshots must remain readable without turning research horizons into multi-year forecasts; Task 1 tests pin this.
3. Malformed event timestamps, missing timezones and future retrieval timestamps must not crash an otherwise valid research session; Task 1 tests pin this.
4. Opening a planning/calendar page with no cached stock and an offline provider must still work; Task 3 browser tests pin this.
5. Skipping/restarting a guide must not delete notes or a saved financial plan; Task 3 tests pin this.

---

### Task 1: Backend contracts, arithmetic and event evidence

**Files:**
- Create: `backend/compass/beginner.py`, `backend/compass/planning.py`, `backend/compass/events.py`, `backend/compass/rookie_routes.py`.
- Modify: `backend/compass/models.py`, `backend/compass/service.py`, `backend/compass/api.py`, `backend/compass/providers/yahoo.py`, and the earnings consumer in `backend/compass/analysis.py` as needed.
- Test: `backend/tests/test_rookie.py`, `backend/tests/test_planning.py`, `backend/tests/test_events.py`.

**Interfaces:**
- Settings adds `experience` and `preferred_workspace`.
- `Analysis.beginner` is optional for legacy snapshots; current service output includes `{conclusion, explanation, caution_kind, caution, next_condition, supporting}`. It uses the existing assessment and never creates signals.
- Onboarding GET/PUT `/api/onboarding`: `{version:1, path:'research'|'long_term', step:0..3, state:'active'|'dismissed'|'complete'}`. Default is active research step zero.
- Planner input: `{goal_name:string, target_amount:number|null, initial_amount:number, monthly_contribution:number, years:number, currency:string, annual_return:number, annual_fee:number}`. Percent inputs use percentage points.
- POST `/api/planning/scenario`: `{inputs, total_contributed, ending_value, growth, fee_impact, goal_gap:number|null, series:[{year,contributed,before_fees,after_fees}], assumptions}`. Series includes year zero and every year end.
- GET/PUT `/api/planning/plan`: validated planner input or null when unsaved. Store under `long_term_plan`.
- GET `/api/watchlist/events?mode=demo|live&window_days=30|90`: `{generated_at,mode,offline,freshness_hours:24,rows}`. Each row: `{symbol,name,kind:'earnings',status:'estimated'|'unknown'|'not_applicable',date_start:string|null,date_end:string|null,date_basis:string|null,exchange_timezone:string|null,source:string|null,retrieved_at:string|null,freshness:'fresh'|'stale'|'unknown',reason_code:string|null,last_reported_date:string|null,refresh_error:object|null,in_window:boolean}`.
- `Watch.earnings` and `Analysis.earnings` use that same row contract, replacing frontend string-parsing and enabling shared presentation. Fields are optional on old serialized snapshots.

- [ ] Write failing endpoint and arithmetic tests before production changes. Representative independent example:

```python
def test_zero_return_end_of_month_contributions(client):
    inputs = dict(goal_name='', target_amount=None, initial_amount=1000,
                  monthly_contribution=100, years=2, currency='PLN',
                  annual_return=0, annual_fee=0)
    response = client.post('/api/planning/scenario', json=inputs)
    assert response.status_code == 200
    result = response.json()
    assert result['total_contributed'] == 3400
    assert result['ending_value'] == 3400
    assert result['fee_impact'] == 0
    assert [point['year'] for point in result['series']] == [0, 1, 2]
```

- [ ] Run `.venv/bin/python -m pytest backend/tests/test_planning.py backend/tests/test_rookie.py backend/tests/test_events.py -q`. Expected initial failures: missing routes/fields, not broken fixture imports.
- [ ] Implement bounded Pydantic inputs with finite-number rejection, end-of-month projection and validated save/load. Factors are `(1+g)**(1/12)` and `((1+g)*(1-f))**(1/12)` with `g=annual_return/100`, `f=annual_fee/100`; each monthly balance is `balance*factor+monthly_contribution`.
- [ ] Implement settings migration and onboarding persistence using existing Store. Attach deterministic beginner information after analysis construction; prioritize data restrictions, real-company event uncertainty, opposing evidence and uncertainty fallback. Synthetic instruments do not inherit invented company risks.
- [ ] Implement earnings normalization using source timestamps and exchange calendar dates; preserve the legacy `data.date` consumer or update it consistently. Aggregate calendar rows directly from cache. Keep same-day events; preserve ranges; a past exact timestamp cannot mask an upcoming range. Unknown fields and legacy observations remain visible, ETFs/demo are not applicable, CSV identity remains unknown. No current metadata ever becomes confirmed.
- [ ] Test closed-form nonzero-return arithmetic, negative returns, zero-fee equality, fee impact and target gap; invalid/missing/NaN/Inf/bounds; new/legacy settings; blocked beginner output; onboarding and plan restart persistence; date/range/legacy/no-cache/ETF/demo/CSV cases; freshness at 24h; missing/future retrieval time; failure warnings; timezone/day boundary and no provider calls.
- [ ] Run the complete backend suite `.venv/bin/python -m pytest -q`. Expected: all tests pass. Record changes and red/green evidence in the task report. No commit is possible in this non-Git workspace.

### Task 2: React beginner journey, planning and calendar

**Files:**
- Create: `frontend/src/BeginnerGuide.tsx`, `frontend/src/BeginnerSummary.tsx`, `frontend/src/LongTerm.tsx`, `frontend/src/Events.tsx`, `frontend/src/EarningsStatus.tsx`.
- Modify: `frontend/src/App.tsx`, `frontend/src/Workspace.tsx`, `frontend/src/Research.tsx`, `frontend/src/types.ts`, `frontend/src/Charts.tsx` if necessary, `frontend/src/styles.css`.
- Add: `locales/rookie.pl.json` and import in `frontend/src/i18n.tsx`.
- Test: `frontend/tests/rookie.spec.ts`.

**Interfaces:**
- Consume Task 1 endpoints and exact model fields above; obtain event updates from existing `dataRevision` and watchlist revision.
- LongTerm receives `notify`; Events receives `{mode,dataRevision,watchRevision,onOpenStock}`. BeginnerGuide receives navigation callbacks, preferences and optional analysis, storing progress through `/onboarding`. BeginnerSummary consumes `Analysis.beginner` with a safe fallback for old snapshots.
- Keep existing view labels/selector names in advanced mode. Add `long-term` and `events` views and sidebar/mobile navigation. Preferred workspace controls initial view after settings load.

- [ ] First write a browser test proving the absent Long-term planning navigation and beginner summary; build the existing frontend and run `npm test --prefix frontend -- rookie.spec.ts`. Expected: feature assertions fail.

```typescript
test('regular contributions remain understandable after input edits', async ({page}) => {
  await page.request.put('/api/settings', {data:{mode:'demo',language:'en',experience:'beginner'}});
  await page.goto('/');
  await page.getByRole('button', {name:'Long-term planning', exact:true}).click();
  await page.getByLabel('Starting amount').fill('1000');
  await page.getByLabel('Monthly contribution').fill('100');
  await page.getByLabel('Years').fill('2');
  await page.getByLabel('Assumed annual return (%)').fill('0');
  await page.getByLabel('Annual ongoing fee (%)').fill('0');
  await page.getByRole('button', {name:'Calculate scenario',exact:true}).click();
  await expect(page.getByTestId('planning-ending-value')).toContainText('3,400');
  await page.getByLabel('Monthly contribution').fill('200');
  await expect(page.getByText('Inputs changed. Recalculate this scenario.')).toBeVisible();
});
```

- [ ] Add TypeScript contracts and the focused components. Persist the guide and saved plan; retain unsaved drafts across language/view changes where practical; prevent responses captured from older drafts from overwriting edited state. Distinguish Calculate from Save.
- [ ] Beginner overview puts conclusion/main caution/watch next before the chart; use disclosures for advanced controls and full evidence. Guide has research/planning paths, Back/Skip/Resume/Restart and explicit step completion. Advanced view remains available in Settings. Ensure AI is optional.
- [ ] Render planner input validation, example loading, results, contribution/before-fee/after-fee chart and annual table. Use accessible labels, localized numbers and display currency. Include short ETF cards with the verified links from the spec; make assumptions and hypothetical status visible.
- [ ] Render a 30/90-day chronological earnings agenda plus coverage for unknown, unverified, out-of-window and not-applicable instruments. Use a shared earnings-status component in watchlist/detail/calendar. Remove event-risk text parsing. Show estimated/date-range/source/retrieval/failure and freshness text without triggering extra provider downloads.
- [ ] Translate all new copy to Polish and add responsive styles using existing cream/green design. Ensure keyboard-operable disclosures and visible focus.
- [ ] Run `npm run build --prefix frontend` and targeted browser tests. Expected: build and new workflows pass. Record output, changes and any concerns in the task report.

### Task 3: Regression, interaction edge cases and delivery

**Files:**
- Modify/add: `frontend/tests/rookie.spec.ts`, existing browser tests' settings setup, `README.md`, `docs/VERIFICATION.md`, `docs/screenshots/rookie-*.png`.
- Modify production files only for observed defects, adding a failing regression case first.

**Interfaces:**
- Consume completed backend and UI from Tasks 1–2. Existing advanced workflows explicitly choose `experience:'advanced'` and research workspace so they continue testing the same product behavior.

- [ ] Run new workflows against deterministic backend. Add seeded event response fixtures for estimated/range/unknown/stale/legacy/ETF conditions. Test empty watchlist/offline views, same-day date rendering under browser timezone changes, stale form response handling, persistence, guide skip/resume/restart without changing saved plans/notes and navigation during failed data loading.
- [ ] Extend ENG/PL checks and mobile 390×844 checks for all new pages. Ensure no horizontal page overflow. Capture desktop/mobile screenshots and inspect rendered images.
- [ ] Make regression fixes via test-first changes. Adjust existing browser setup to explicitly use advanced view; never weaken its assertions to accommodate a regression.
- [ ] Run `.venv/bin/python -m pytest -q`, `npm run build --prefix frontend`, and `npm test --prefix frontend`. Expected: all complete successfully; report any preexisting baseline failures by name if they cannot be resolved within this scope.
- [ ] Update README and verification record with new navigation, assumptions, earnings limitations and actual test evidence. Leave user database and credentials untouched. Write final task report and leave durable ledger in place because no Git history exists.

## Execution record

The coordinator saves source snapshots before each task, reviews the task's changes with a fresh reviewer, resolves important findings before the next task, and performs a final review of the complete deliverable. User authorization is the latest “do all”; there is no additional plan-approval stop.
