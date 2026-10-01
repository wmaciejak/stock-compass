# Data and reliability conventions

The following conventions describe daily research data. Actual hourly chart data use the separately documented [hourly conventions](HOURLY.md), including their provider-native price basis and 20-minute publication allowance.

The main watchlist may additionally show a yfinance **current-session provider quote**. It uses the provider's regular-market price, previous close and timestamp as one provider-native observation. The app calculates its percentage from those two prices. It appears only when its timestamp is within a regular NYSE session, no more than 30 minutes old, and later than the latest completed daily bar. It is provisional and may be delayed; the provider's actual delay is unknown. Quote values never enter daily candles, indicators, heuristic assessments, benchmark comparisons, backtests or exports. Demo and CSV data have no live quote. Missing, old or failed-refresh quotes fall back to the clearly labeled completed daily close/change.

## Provider boundary

`providers/base.py` defines a Bundle and Provider protocol. Each adapter declares price history, symbol metadata, corporate actions, earnings, fundamentals and news capabilities. Missing optional features use typed `available`, `unavailable`, or `error` states; unknown earnings means unknown event risk. Price/metadata failures never substitute fixtures or another provider. Adding a licensed API changes the provider adapter and source selection, not indicator or interpretation logic.

yfinance fetches about six calendar years (five years of research plus warm-up), daily, `auto_adjust=False`, `back_adjust=False`, `repair=False`, `actions=True`, with a 12-second history timeout and a 40-second wall-clock worker cap including metadata. There are at most two app attempts with a one-second backoff; explicit rate limits are not retried. Failures impose a two-minute refresh cooldown. yfinance's own transport may also retry internally. Process isolation caps total waiting. The API client allows up to 110 seconds per operation, so unusually slow stock-plus-benchmark initial downloads can require reopening after the cached stock completes.

US exchange identifiers, USD currency, EQUITY/ETF quote type, company name and exchange timezone must be verified before a real symbol is accepted. ADRs are provider-classified equities. CSV metadata is explicitly user-declared, not verified. Unsupported listings are refused. No starter-symbol hardcoding occurs in the Yahoo adapter.

## Native vs analysis series

SQLite retains the provider-native frame, including raw OHLC, adjusted close, dividends and splits when returned. For Yahoo, the analysis adjustment factor is `Adj Close / Close`; multiply **all four OHLC** by it. Volume remains Yahoo-native, never multiplied by a dividend price factor. No automatic price repairs are requested. Split-adjusted native volume is not further adjusted by this app. Imported frames are retained exactly after CSV parsing, with original row order and duplicates available in the cache.

Yahoo's normalized OHLC are split/dividend-adjusted research prices in current units. Charts, indicators, rules, strategies and baseline all use the same frame. No extra dividend cash flows are added, avoiding double counting. The simulation uses synthetic adjusted share units and approximates reinvested-dividend economics; it is not a tax/accounting or executable historical-price simulator. A split-only CSV consistently reports **price returns excluding dividends**; its benchmark must share that convention. Unadjusted/unknown CSV cannot support strategy results without additional action normalization, which this release does not infer.

## Validation and sessions

Daily indices are exchange-local session **dates**, separate from timestamps. NYSE's US equity calendar governs supported primary listings and ADRs, including US holidays, early closes and daylight saving. The latest expected bar is the last session whose scheduled close plus a documented **120-minute publication allowance** is past. A holiday does not create an outage. This conservative release withholds a newly completed bar during the allowance rather than assuming immediate provider publication.

Sort sessions and flag reordered native input. Duplicate sessions retain the first for inspection and block recommendations. Invalid OHLC/nonpositive price bars are excluded, flagged and block recommendations. No estimated price repair or forward-fill occurs. Non-session bars block recommendations; unfinished bars are excluded. Missing tradable sessions between first and last bar block recommendations. Missing/nonpositive volume becomes unavailable, never zero; invalid recent volume blocks action/backtest eligibility. Earlier gaps in volume break OBV continuity; volume-based signals remain unavailable in affected windows.

Completed weekly bars aggregate daily candles only if **every expected session in the week is present and the final scheduled weekly session is published**. An unfinished Friday week is excluded; a Thursday-ended holiday week can be complete. Weekly close vs 20-week SMA provides broad context. Daily/weekly disagreement is shown. TA-Lib NaN warm-up is preserved: SMA 200 needs 200 values, RSI/ATR 14 need 15, MACD 12/26/9 needs 34, ADX 14 needs 28. A short history exposes unavailable metrics and suppresses unsupported action labels, with scope explicitly limited.

## Cache and freshness

Cache keys include selected provider, symbol, daily interval, requested history range and adjustment convention. CSV keys use imported first/last session bounds. Built-in fixtures and Yahoo requests use fixed range identifiers. Raw data are persisted with source, retrieval time, exchange timezone, last completed session, publication allowance and normalization flags. Fetches occur on first stock/benchmark load or explicit refresh; chart controls only use JSON already loaded. No automatic provider stitching. An explicit CSV replacement changes the whole source and invalidates previous backtest results through retrieval timestamps.

Cached stale data show the original retrieval time and latest bar; action labels and simulations are blocked. A failed refresh may return cached inspection values with a prominent refresh-failure issue and blocked action label. Concurrent duplicate downloads are bounded but are not centrally queued in this personal release. Opening/reloading the site and each enabled auto-refresh cycle request fresh daily data for the watchlist and benchmark serially. The benchmark is requested once per cycle. Watchlist rows display the source retrieval timestamp; unchanged prices can mean that no new completed bar was published. A visible hourly chart has a separate timed refresh.

## Comparison and exports

Relative returns use common stock/benchmark session dates with 21, 63 and 126 matched-session lookbacks. Excess return is arithmetic percentage-point difference, not RSI. Comparison charts use the common intersection and a shared starting close, with compatible adjustment conventions. Selected histories may have shorter six-month coverage, so chart start/end dates are always explicit.

Reports/CSV keep synthetic labels, source, timestamps, rule version and basis. Saved snapshots are actual records created by the user; no historical snapshots are fabricated. If sources/basis differ between snapshots, price-change comparison is withheld. With matching semantics, the saved session's close is restated using the current consistent analysis series before comparing; corporate-action/provider revisions are explicitly flagged rather than reporting a split as a price collapse.
