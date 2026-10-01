# Important dependency licenses

Installed exact versions are pinned in `requirements.lock` and `frontend/package-lock.json`. No dependency source was modified.

| Dependency | Installed version | License / implication |
| --- | --- | --- |
| React / React DOM | 19.3.0 | MIT |
| Vite | 6.4.3 | MIT; [6.4 still receives security backports](https://vite.dev/releases) |
| TypeScript | 5.9.3 | Apache-2.0 |
| Lightweight Charts | 5.2.1 | Apache-2.0, required TradingView notice and link; see root NOTICE and chart footer |
| lucide-react | 0.468.0 | ISC for library, additional icon notices in distribution |
| FastAPI | 0.142.1 | MIT |
| Pydantic | 2.13.5 | MIT |
| OpenAI Python SDK | 2.54.0 | Apache-2.0; optional external API usage is billed separately |
| Uvicorn | 0.54.0 | BSD-3-Clause |
| pandas | 2.3.3 | BSD-3-Clause; bundled third-party notices remain in installed distribution |
| NumPy | 2.5.3 | BSD-3-Clause with bundled components under additional permissive licenses |
| TA-Lib Python / C library | 0.7.1 wrapper | BSD; wheels bundle the TA-Lib C library, no native build here |
| yfinance | 1.7.0 | Apache-2.0; library license does not grant Yahoo market-data rights |
| Backtesting.py | 0.6.6 | **AGPL-3.0**; assess corresponding-source/network-use obligations before redistribution or hosted use; this deliverable is source-complete local personal software |
| pandas-market-calendars | 5.4.0 | MIT |
| SQLite | Python built-in | SQLite is public domain; Python under PSF license |
| pytest / Playwright | 9.1.1 / 1.63.0 | MIT / Apache-2.0 |

The original dependency licenses/notices remain in their installed distributions. If packaging or distributing the app, include all required third-party licenses and review the AGPL dependency implications. Market data and news are separately governed by their providers' terms.

[Lightweight Charts official licensing/attribution instructions](https://tradingview.github.io/lightweight-charts/docs), [official NOTICE](https://github.com/tradingview/lightweight-charts/blob/master/NOTICE), [Backtesting.py license](https://github.com/kernc/backtesting.py/blob/master/LICENSE.md), [TA-Lib wrapper](https://github.com/TA-Lib/ta-lib-python).
