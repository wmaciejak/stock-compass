"""Reproducible synthetic fixtures. Never used for real symbols."""

from pathlib import Path
import numpy as np
import pandas as pd
import pandas_market_calendars as mcal

root = Path(__file__).resolve().parents[1] / "fixtures"
dates = mcal.get_calendar("NYSE").schedule("2020-09-30", "2026-09-29").index
for seed, (symbol, drift, vol) in enumerate(
    [
        ("DEMO_TREND", 0.00065, 0.013),
        ("DEMO_RANGE", 0.00005, 0.01),
        ("DEMO_VOLATILE", 0.00035, 0.024),
        ("DEMO_MARKET", 0.0003, 0.009),
    ],
    start=41,
):
    rng = np.random.default_rng(seed)
    n = len(dates)
    shocks = rng.normal(drift, vol, n) + np.sin(np.arange(n) / 60) * 0.0008
    close = 70 * np.exp(np.cumsum(shocks))
    open_ = np.r_[close[0], close[:-1]] * np.exp(rng.normal(0, vol * 0.2, n))
    wiggle = rng.uniform(0.002, vol, n)
    frame = pd.DataFrame(
        dict(
            Date=dates.strftime("%Y-%m-%d"),
            Open=open_,
            High=np.maximum(open_, close) * (1 + wiggle),
            Low=np.minimum(open_, close) * (1 - wiggle),
            Close=close,
            Volume=rng.integers(800000, 3500000, n),
        )
    )
    frame.to_csv(root / f"{symbol}.csv", index=False, float_format="%.6f")
print("Wrote four visibly synthetic daily fixtures, seed 41–44, through 2026-09-29.")
