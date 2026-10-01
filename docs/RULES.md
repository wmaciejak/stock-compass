# Stock Compass rules — compass-1.1.0

The optional [1H chart](HOURLY.md) recalculates chart indicators and causal zones on completed hourly bars. It does not change these daily assessment or simulation rules; hourly trading recommendations and backtests are not implemented.

A current-session provider quote can appear on the watchlist and stock heading with its own timestamp. It is a provisional display observation only and has no role in these completed-bar rules.

## Research horizons and indicators

The four selectable research horizons use completed daily candles and completed weekly context:

- **1–2 weeks:** shorter monitoring of the same daily confirmations, EMA 20, RSI/MACD, ATR and 20-session structure. It does not introduce a tested 1–2 week holding strategy or a promised target date.
- **2–8 weeks:** the existing daily setup decisions, 20/55-session ranges and volatility-aware structural scenarios, momentum and participation.
- **1–6 months:** the same daily templates; an action label additionally requires broad daily trend and bullish 20-week completed context. Inspect 3/6-month benchmark returns.
- **6–12 months:** the same stricter broad-trend and bullish 20-week context requirements, with SMA 200 and available 6-month benchmark returns for technical research. It does not validate a long-term holding strategy or forecast.

Backtests still evaluate the two fixed daily strategies over their stated historical dates; changing a research horizon does not claim new historical evidence or change their rules. Version 1.1.0 adds the two horizon profiles and explicit scope; canonical crossover/breakout parameters remain unchanged. Previous versioned backtests remain stored; rerun to obtain results under the current version. No intraday trading or separate monthly execution model is implemented.

Chart windows are independent of the research horizon: 1W/2W/1M show up to 5/10/21 completed sessions; 3M/6M/1Y show up to 63/126/252. These are approximate trading-session windows, not calendar-duration guarantees. Short zoom does not discard indicator warm-up. Resistance / Opór is a display control only (checked shows resistance; unchecked removes it): confirmed support, scenario levels and rule evaluation remain intact.

TA-Lib 0.7.1 is the only active indicator engine: SMA 20/50/200, EMA 20, ADX 14, RSI 14, MACD 12/26/9, ATR 14, Bollinger 20 ±2 standard deviations, OBV, and engulfing/hammer/shooting-star patterns. Wilder initialization/smoothing and NaN warm-up are TA-Lib's. No fallback engine was needed; no alternate initialization is combined. SMA 50 slope is its percent change over five earlier sessions. Relative volume divides current volume by the **preceding** 20-session average.

## Canonical traded rules

`rules.decision(frame, index)` is reused verbatim by the current evaluator and simulator. All price inputs are available at the decision bar's completed close.

1. **SMA crossover:** enter if previous SMA 20 ≤ SMA 50 and current SMA 20 > SMA 50. Exit if previous SMA 20 ≥ SMA 50 and current SMA 20 < SMA 50. No stop or take-profit in this deliberately simple strategy.
2. **20-session breakout:** completed close > maximum high of the 20 **preceding** sessions, close > SMA 50 > SMA 200, SMA 50 five-session slope > 0, and relative volume ≥1.2. Initial stop is decision close −3 ATR 14, provided it is positive. On every completed close while in position set stop to `max(previous stop, close −3 ATR)`. The stop is never lowered and the newly updated stop applies only after that close, starting on the next bar. Re-entry is permitted on a later valid breakout after a stop exit. There is no take-profit order.

Orders are next-session market orders (`trade_on_close=False`). Both strategies and baseline allocate 95% of cash to whole shares, margin=1, one long position, no shorts/leverage. Initial research cash defaults to $10,000; this is a simulation assumption, not inferred user finances. The API permits an explicit cash assumption. UI costs default to 0.1% commission each side and 0.1% spread. These are editable assumptions, not broker quotes. Installed Backtesting.py 0.6.6 supports commission and spread, not a separate slippage argument; spread is modeled as a one-sided entry-price uplift approximating round-trip spread/slippage.

## Stops, gaps and end valuation

Installed engine source `backtesting.py:_Broker._process_orders` was inspected and a fixture verifies a 95 stop gapped through by an 85 opening fills at 85, not 95. A normal long stop fills at the stop when touched intrabar, or at the worse opening price for a gap. Bracket stops can be processed again on the entry bar after a market entry. Neither fixed strategy places target orders: daily stop/target ordering ambiguity is avoided. If adding targets later, use the engine's pessimistic stop-first convention and separately test new entry-bar ambiguities; do not assume a path within OHLC.

Open positions are marked at the final completed close (`finalize_trades=False`) and excluded from closed-trade win rate, expectancy, profit factor and trade count. No fictional last-close exit or exit commission is added. Exposure includes both closed-trade intervals and open positions (the engine's built-in exposure omits open trades). The strategy and baseline share data, decision start, first possible next-open fill, whole-share 95% allocation and costs. Buy-and-hold enters once after the first evaluable completed decision bar and stays open. All use the same adjusted OHLC; dividends are not paid again.

## Assessment and heuristic ranking

The heuristic score groups evidence: trend 30, momentum 20 (RSI 50–70 plus positive MACD histogram), participation 15 (volume ≥1.2×), structure 20 (full breakout), market-relative 15 (positive 63-session benchmark excess). Mixed trend with close above SMA 200 gets 10. Several moving averages count once. ADX describes strength, never direction; patterns are supporting observations and add no score. Ranking is within the user's watchlist and never a probability of profit.

- **Buy setup worth considering:** a current canonical rule has triggered, data quality passes, and a defensible scenario exists. Broad bearish daily conditions override the action label; longer-horizon weekly/daily alignment is required.
- **Wait for confirmation:** broad trend is interesting or a rule triggered, but confirmation or structural reward/risk is incomplete.
- **Unfavorable setup:** close below both SMA 50 and SMA 200 argues against a new long entry.
- **No clear edge:** mixed or weak evidence; no complete scenario supported by the rules.
- **Insufficient or stale data:** stale, corrupted, critically incomplete, unknown-basis or <200-session history. No actionable scenario or backtest is offered.

The evaluator lists supporting/opposing facts, rule version, price basis, data quality, event limitations and next condition. Unknown earnings is explicit and not treated as no risk. An action label is conditional research triage; event verification is still required. Heuristic scores are separate from the two historical strategy tests.

## Causal zones and scenarios

A swing is a unique high/low relative to two sessions on each side. It becomes available only at **pivot +2 close**. Use pivots within the preceding 125 sessions; merge same-kind pivots within 0.3 current ATR, placing ±0.15 ATR bands around each pivot. Display up to eight nearest zones. Prior 20/55 highs/lows exclude the current bar. Appending later candles cannot alter a decision or zone computed at an earlier index.

Entry reference is signal close when a rule triggers, otherwise prior 20-session high as a condition to watch. Upper entry reference = entry +0.25 ATR. Invalidation = the greater of prior 20-session low and nearest confirmed support low, minus 0.5 ATR; cap it at entry −1 ATR to avoid a tight stop. Target = nearest eligible causal resistance lower boundary or prior 55 high, above the upper entry, offering at least **1.5 reward/risk at the upper entry**. This is a historical structure reference, not an analyst price prediction. Enforce `0 < stop < entry < target`. If no defensible target exists, withhold the scenario. A next-open price outside the reference range requires reassessment.

## Historical evidence

Fetch six calendar years and reserve at least 200 sessions of warm-up; evaluate the latest at most 1,260 sessions. At least 220 valid bars are required. No optimization or parameter search. Report three chronological portions of the first 80% and a separately labeled most recent 20% frozen-rule holdout. These are segments of the continuing portfolio, including inherited positions, not independent restarted portfolios. Period returns compare first/last marked equity in each segment. The holdout is not used to choose a rule.

Metrics: net total return, CAGR only with ≥one calendar year, marked-equity maximum drawdown, closed trade count, net win rate, mean closed-trade net P/L expectancy in research USD, gross gains / absolute gross losses profit factor, and session exposure. Zero trades produce undefined win rate/expectancy/profit factor. No losses means undefined (not a fabricated infinite) profit factor. Evidence with <20 closed trades is flagged limited. No Sharpe ratio is reported. If the rule fails to beat buy-and-hold after costs, the app states that plainly; a backtest win rate is never the next trade's probability.
