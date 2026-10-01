from pathlib import Path
import pandas as pd
from compass.models import Instrument
from .base import Bundle, ProviderError, unavailable, FEATURES

ROOT = Path(__file__).resolve().parents[3]
NAMES = {
    "DEMO_TREND": "Synthetic trend laboratory",
    "DEMO_RANGE": "Synthetic range laboratory",
    "DEMO_VOLATILE": "Synthetic volatility laboratory",
    "DEMO_MARKET": "Synthetic market benchmark",
}


class DemoProvider:
    name = "synthetic fixture v1"
    capabilities = {f: f in ["price_history", "symbol_metadata"] for f in FEATURES}

    def fetch_hourly(self, symbol):
        bundle = self.fetch(symbol)
        bundle.native = pd.read_csv(ROOT / "fixtures" / f"{symbol}_1h.csv", index_col="Datetime", parse_dates=True)
        bundle.source = "synthetic hourly fixture v1"
        return bundle

    def fetch(self, symbol):
        if symbol not in NAMES:
            raise ProviderError(
                "Unknown demo instrument. Try DEMO_TREND, DEMO_RANGE or DEMO_VOLATILE.",
                "unknown_symbol",
            )
        f = pd.read_csv(
            ROOT / "fixtures" / f"{symbol}.csv", index_col="Date", parse_dates=True
        )
        instrument = Instrument(
            symbol=symbol,
            name=NAMES[symbol],
            exchange="NYSE",
            currency="USD",
            instrument_type="SYNTHETIC",
            synthetic=True,
        )
        return Bundle(
            instrument,
            f,
            "split_dividend_adjusted",
            self.name,
            {
                k: unavailable("Synthetic example has no company, events or news.")
                for k in ["earnings", "fundamentals", "news"]
            },
        )

    def unavailable(self, feature):
        return unavailable("Synthetic example: feature unavailable.")
