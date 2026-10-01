from io import StringIO
import pandas as pd
from .base import Bundle, unavailable, FEATURES
from compass.models import Instrument


class CSVProvider:
    name = "user CSV"
    capabilities = {f: f in ["price_history", "symbol_metadata"] for f in FEATURES}

    def parse(self, request):
        try:
            f = pd.read_csv(StringIO(request.csv))
        except Exception as e:
            raise ValueError(f"CSV could not be read: {e}") from e
        if "Date" not in f:
            raise ValueError("CSV requires a Date column in YYYY-MM-DD format.")
        if not f.Date.astype(str).str.fullmatch(r"\d{4}-\d{2}-\d{2}").all():
            raise ValueError(
                "Date must be a session date in YYYY-MM-DD format, without timestamps."
            )
        f = f.set_index("Date")
        f.index = pd.to_datetime(f.index)
        if len(f) > 10000:
            raise ValueError("CSV is limited to 10,000 daily sessions.")
        instrument = Instrument(
            symbol=request.symbol,
            name=request.name,
            exchange=request.exchange,
            currency=request.currency,
            instrument_type="USER_DECLARED",
            synthetic=request.symbol.startswith("DEMO_"),
        )
        return Bundle(
            instrument,
            f,
            request.price_basis,
            self.name,
            {
                k: unavailable(
                    "CSV contains prices only. Company identity is user-declared; events and news unknown."
                )
                for k in ["earnings", "fundamentals", "news"]
            },
        )
