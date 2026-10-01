# Stock Compass ENG / PL switch

The user's request authorizes implementing this language switch without another routine approval gate. Existing analysis and research pages define the scope; no financial formulas or rule decisions change.

1. Add language to validated SQLite-backed settings, default English for existing installations. Verify persistence and unchanged numerical outputs with deterministic tests.
2. Keep offline Polish catalogs separate from calculations. Use a React language context and explicit display translations, including deterministic analysis templates with placeholders that preserve values. Preserve machine enums, tickers, company names, user notes and native news.
3. Add an accessible ENG / PL segmented control beside the mode control. Set HTML lang and locale-format numbers/dates. Switching language does not request fresh market data.
4. Localize existing App and chart UI. Independently localize Research/Workspace screens and the analysis/learning catalog under the parallel-agent skill, in separate owned files.
5. Support a Polish Markdown export with original provenance and visibly synthetic labels; CSV keeps stable machine headers.
6. Run pytest, the production build and all browser workflows. Test language switching, persisted choice, unchanged financial facts, offline Polish report export and a narrow viewport. Inspect desktop and narrow Polish UI before delivery.

Parent owns i18n/context, App/Charts, settings/API/export integration and tests. Parallel task one owns Research/Workspace and locales/workspace.pl.json. Parallel task two owns locales/analysis.pl.json only. A final review checks locale completeness and machine-data preservation.
