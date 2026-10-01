# Hourly chart conventions

Select Daily / 1H above the detail chart. Range buttons change the visible window; the interval selector changes the actual candles and chart indicator inputs. EMA 20 on 1H means 20 hourly bars, not 20 days. RSI, MACD, averages, Bollinger Bands, volume and confirmed zones use the selected interval. Two later completed bars confirm an hourly pivot. Daily research assessments, scenarios, benchmark comparisons, simulations and exports retain completed daily inputs. No hourly trading strategy has been validated, and daily entry/stop/target lines are excluded from the hourly chart.

## Live data and provenance

The unofficial yfinance adapter requests 60 calendar days of regular-session 1H history. Actual availability can be shorter; this is not five years of hourly data or a real-time guarantee. Symbol identity uses the same US listing, currency and instrument validation as daily history. A separate typed API response records source, retrieval time, engine, exchange timezone, price basis, last completed start/end and quality flags.

Live hourly OHLC are **provider-native**. Split/dividend adjustment is not independently verified. An Adj Close column may be synthesized by yfinance when upstream adjusted data are absent, so its presence is not taken as proof of adjustment. The app preserves native prices, does not mix adjusted close with other OHLC, and labels this limitation in the chart. Hourly indicators are for inspection; daily adjusted-price strategy evidence cannot be transferred to this series.

## Sessions and reliability

UTC timestamp instants are retained, while chart labels use the instrument's exchange timezone. The NYSE calendar supplies holidays, daylight-saving transitions and early closes. Candles start at the session open in one-hour steps; the final regular-session candle can be shorter (normally 30 minutes). Unfinished candles are excluded using the earlier of the download start and current time. A partial candle captured in cache remains excluded until a later download obtains its completed values; waiting alone cannot complete cached OHLC. Older cache entries use their recorded retrieval time as the completion cutoff. Freshness still uses the latest expected completed candle at the current time after a 20-minute publication allowance.

Duplicates, invalid OHLC, missing candles and invalid volume are flagged. No tradable candles are forward-filled or invented. Missing volume remains unavailable. TA-Lib warm-up values remain blank; short histories limit indicator availability. Cache keys isolate provider, instrument, 1H interval, 60-day window and price convention from daily history. Opening 1H, changing the selected ticker while in 1H, and explicit hourly refresh request fresh data, including when automatic refresh is off. Zoom, overlays, language and range controls do not download. Bounded retries and worker timeouts apply. Failed refreshes remain visible on cached reads, with a two-minute retry cooldown, until a successful fetch. No other provider is silently stitched in.

## Offline and imports

Reproducible fictional hourly fixtures exist only for DEMO instruments and stay visibly synthetic. `scripts/generate_hourly_demo.py` derives them from the fictional daily fixtures; aggregation reproduces those daily OHLC and volume. No synthetic hourly prices are attached to real tickers. Demo runs without network access.

The current CSV adapter imports daily candles only. Selecting 1H on an imported daily instrument returns an explicit unavailable message; it does not infer hourly candles from daily prices. An hourly CSV extension would need timestamp/session and adjustment metadata validation.
