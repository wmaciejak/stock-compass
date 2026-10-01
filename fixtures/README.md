# Synthetic fixtures

All four CSVs are reproducible, entirely fictional daily OHLCV histories. They have no corporate facts, news or earnings. `scripts/generate_demo.py` uses NumPy generators with seeds 41–44 and the US equity calendar, from 2020-09-30 through 2026-09-29. No made-up values are assigned to real stock symbols.

DEMO_MARKET is the demo's synthetic benchmark. Adjustment convention is split/dividend-adjusted research units, with no simulated actions. Built-in names cannot be overwritten through import. Regeneration uses the locked NumPy/calendar environment. Demo is a fixed historical laboratory, visibly synthetic and explicitly exempt from live freshness; the fixture date remains visible in UI and exports.
