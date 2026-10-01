# Provider investigation — September 30, 2026

No subscription, account or purchase was made. yfinance is the initial unofficial personal-research adapter; CSV is the fallback available without a service. No official backup adapter is activated because a free dashboard-compatible adjusted-history entitlement was not established.

| Need | Twelve Data | Alpha Vantage |
| --- | --- | --- |
| Daily history ≥200 sessions, ideally 5 years | `/time_series` supports date ranges and up to 5,000 points/request; enough if the instrument/plan permits the series | `TIME_SERIES_DAILY` compact free response is 100 points; full 25+ years is premium. `TIME_SERIES_DAILY_ADJUSTED` is premium |
| Split/dividend semantics | Daily/weekly/monthly prices are split-adjusted. Their support page points to `/splits` and `/dividends` for further client adjustment; do not assume Yahoo-compatible dividend-adjusted OHLC or included event entitlements | Daily adjusted endpoint supplies raw OHLCV, adjusted close and split/dividend events; multiply all OHLC by adjusted-close/close locally, retaining appropriate native volume |
| Free quota | Basic: 8 API credits/minute, 800/day. `/time_series` is 1 credit per symbol; heavier fundamentals cost more | Standard free allowance: 25 requests/day; insufficient history/endpoint entitlement still prevents the required analysis |
| Display permission | Pricing explicitly labels Basic **internal non-display**. Grow adds internal display. Generic personal-use support language does not override this specific plan restriction | Terms grant personal, non-commercial access/display for private investment research. Realtime/delayed US market data requires separate entitlement; historical EOD is the relevant capability |
| Cost | Basic is $0 but not accepted for this dashboard. Individual pricing advertises Grow from $29/month; selected credit bundles and annual billing change quoted totals. Exact exchange/endpoint entitlements must be verified for the account | Free is $0. Official checkout source lists 75 requests/minute at $49.99/month, 150 at $99.99, 300 at $149.99, 600 at $199.99 and 1,200 at $249.99. Adjusted/full daily requires premium; realtime/delayed display still requires the entitlement process |
| Fits this app? | Potential licensed extension, with a display-entitled plan and explicit dividend normalization/endpoint access. Not a compatible free drop-in | Better future semantic fit for adjusted daily research, but paid history is required. Not a free-core substitute |

Twelve Data's generic acceptable personal/internal-use examples and its Basic non-display pricing are narrower/different statements. This app renders prices, so it must not treat Basic as permission to display merely because personal research is allowed generally. Accessing symbol reference metadata also does not imply that exchange price history or corporate-action endpoints are included. US-listed ETFs and ADRs require verification under the chosen account's catalog/entitlements. Neither service was tested with a personal API key here.

An official adapter should declare endpoint capabilities and account entitlements, preserve native data/events, normalize the full consistent OHLC series, disclose provider differences, enforce quota-aware caching, and refetch a complete series when selected. Do not silently stitch another provider's last candles onto Yahoo history. Keep a key only in backend `.env`. Locally compute TA-Lib indicators; no provider technical rating is used.

Official sources checked:

- [Twelve Data individual pricing](https://twelvedata.com/pricing): quotas, display restrictions, credit costs and advertised plan prices.
- [Twelve Data personal/commercial usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage): personal-use scope and redistribution restrictions.
- [Twelve Data adjustments](https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted): split-adjusted daily semantics and corporate-action endpoints.
- [Twelve Data history requests](https://support.twelvedata.com/en/articles/5214728-getting-historical-data): ranges, outputsize and 5,000-point maximum.
- [Alpha Vantage API documentation](https://www.alphavantage.co/documentation/): compact/full daily, premium adjusted endpoint and actions.
- [Alpha Vantage premium](https://www.alphavantage.co/premium/): free 25/day, paid membership and separate realtime/delayed entitlement.
- [Alpha Vantage terms](https://www.alphavantage.co/terms_of_service/): private personal research/display license scope.
- [yfinance history documentation](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html): explicit adjustment, repair, actions, response shape and timeout controls.
