from dataclasses import dataclass
from typing import Protocol
import pandas as pd
from compass.models import Instrument, Availability


class ProviderError(Exception):
    def __init__(self, message, code="provider_error"):
        super().__init__(message)
        self.code = code


@dataclass
class Bundle:
    instrument: Instrument
    native: pd.DataFrame
    basis: str
    source: str
    context: dict


class Provider(Protocol):
    name: str
    capabilities: dict[str, bool]

    def fetch(self, symbol: str) -> Bundle: ...
    def unavailable(self, feature: str) -> Availability: ...


class HourlyProvider(Protocol):
    def fetch_hourly(self, symbol: str) -> Bundle: ...


FEATURES = [
    "price_history",
    "current_session_quote",
    "symbol_metadata",
    "corporate_actions",
    "earnings",
    "fundamentals",
    "news",
]


def unavailable(reason):
    return Availability(status="unavailable", reason=reason).model_dump()
