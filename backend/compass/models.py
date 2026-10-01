from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator

Horizon = Literal["1–2 weeks", "2–8 weeks", "1–6 months", "6–12 months"]
Basis = Literal["split_dividend_adjusted", "split_adjusted", "unadjusted", "unknown"]
Label = Literal[
    "Buy setup worth considering",
    "Wait for confirmation",
    "Unfavorable setup",
    "No clear edge",
    "Insufficient or stale data",
]


class Instrument(BaseModel):
    symbol: str
    name: str
    exchange: str
    currency: str
    instrument_type: str
    timezone: str = "America/New_York"
    synthetic: bool = False


class Availability(BaseModel):
    status: Literal["available", "unavailable", "error"]
    reason: str | None = None
    data: dict | list | None = None
    retrieved_at: str | None = None


class Provenance(BaseModel):
    source: str
    retrieved_at: str
    last_completed_bar: str | None
    expected_completed_bar: str
    exchange_timezone: str
    price_basis: Basis
    repair_flags: list[str] = []
    cache: bool = False
    synthetic: bool = False
    interval: str = "1d"
    requested_range: str = "5 years + 1 year warm-up"
    publication_allowance_minutes: int = 120


class Quality(BaseModel):
    actionable: bool
    stale: bool
    issues: list[str]
    missing_sessions: list[str] = []
    provisional_bars: int = 0
    bars: int


class Scenario(BaseModel):
    entry: float
    entry_max: float
    stop: float
    target: float
    reward_risk: float
    trigger: str
    basis: str


class Assessment(BaseModel):
    label: Label
    horizon: Horizon
    horizon_scope: str
    rule_version: str
    timestamp: str
    price_basis: Basis
    data_quality: Quality
    supporting: list[str]
    opposing: list[str]
    next_condition: str
    event_risk: str
    summary: str
    score: int
    contributions: list[dict]
    scenario: Scenario | None
    strategy_signals: dict


class EarningsRow(BaseModel):
    symbol: str
    name: str
    kind: Literal['earnings'] = 'earnings'
    status: Literal['estimated', 'unknown', 'not_applicable']
    date_start: str | None = None
    date_end: str | None = None
    date_basis: str | None = None
    exchange_timezone: str | None = None
    source: str | None = None
    retrieved_at: str | None = None
    freshness: Literal['fresh', 'stale', 'unknown'] = 'unknown'
    reason_code: str | None = None
    last_reported_date: str | None = None
    refresh_error: dict | None = None
    in_window: bool = False


class BeginnerSummary(BaseModel):
    conclusion: Label
    explanation: str
    caution_kind: Literal['data', 'earnings', 'event_unknown', 'opposing', 'uncertainty']
    caution: str
    next_condition: str
    supporting: list[str]


class Analysis(BaseModel):
    beginner: BeginnerSummary | None = None
    earnings: EarningsRow | None = None
    instrument: Instrument
    provenance: Provenance
    assessment: Assessment
    metrics: dict[str, float | None]
    bars: list[dict]
    zones: list[dict]
    weekly: dict
    relative: dict
    education: list[dict]
    patterns: list[dict]
    context: dict[str, Availability]
    changes: list[str]
    benchmark: str
    engine: str
    lessons: list[dict]
    terms: dict[str, str]


class HourlyQuality(BaseModel):
    stale: bool
    issues: list[str]
    missing_bars: list[str]
    provisional_bars: int
    bars: int
    expected_completed_bar: str | None


class HourlyChart(BaseModel):
    symbol: str
    interval: Literal["1h"]
    synthetic: bool
    engine: str
    bars: list[dict]
    zones: list[dict]
    source: str
    price_basis: Literal["provider_native", "split_dividend_adjusted"]
    retrieved_at: str
    exchange_timezone: str
    last_completed_bar: str
    last_completed_end: str
    cache: bool
    quality: HourlyQuality
    publication_allowance_minutes: int


class SymbolInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)


class CompareInput(BaseModel):
    symbols: list[str] = Field(min_length=2, max_length=4)


class ComparisonResult(BaseModel):
    analyses: list[Analysis]
    series: list[dict]
    start: str
    end: str
    price_basis: Basis


class Settings(BaseModel):
    experience: Literal['beginner', 'advanced'] = 'beginner'
    preferred_workspace: Literal['research', 'long_term'] = 'research'
    language: Literal["en", "pl"] = "en"
    mode: Literal["demo", "live"] = "demo"
    benchmark: str = "SPY"
    horizon: Horizon = "2–8 weeks"
    commission: float = Field(default=0.001, ge=0, le=0.05)
    spread: float = Field(default=0.001, ge=0, le=0.05)


class CSVInput(BaseModel):
    symbol: str
    name: str = Field(min_length=1, max_length=150)
    exchange: Literal["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"]
    currency: Literal["USD"]
    price_basis: Basis
    csv: str = Field(max_length=2_000_000)


class BacktestInput(BaseModel):
    strategy: Literal["crossover", "breakout"]
    commission: float = Field(default=0.001, ge=0, le=0.05)
    spread: float = Field(default=0.001, ge=0, le=0.05)
    cash: float = Field(default=10000, ge=100, le=1e9)


class SizingInput(BaseModel):
    account: float = Field(gt=0, le=1e12)
    account_currency: str = Field(pattern=r"^[A-Z]{3}$")
    entry: float = Field(gt=0)
    stop: float = Field(gt=0)
    risk_percent: float = Field(gt=0, le=100)
    instrument_currency: str = Field(pattern=r"^[A-Z]{3}$")
    conversion_rate: float | None = Field(default=None, gt=0)
    conversion_date: str | None = None


class JournalInput(BaseModel):
    symbol: str
    thesis: str = Field(min_length=1, max_length=10000)
    outcome: str = Field(default="", max_length=10000)
    analysis_id: int | None = None


class NoteInput(BaseModel):
    text: str = Field(max_length=10000)


class Onboarding(BaseModel):
    version: Literal[1] = 1
    path: Literal['research', 'long_term'] = 'research'
    step: int = Field(default=0, ge=0, le=3, strict=True)
    state: Literal['active', 'dismissed', 'complete'] = 'active'


class PlanningInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    goal_name: str = Field(default="", max_length=100)
    target_amount: float | None = Field(default=None, gt=0, le=1e12)
    initial_amount: float = Field(ge=0, le=1e9)
    monthly_contribution: float = Field(ge=0, le=1e7)
    years: int = Field(ge=1, le=50, strict=True)
    currency: Literal['USD', 'PLN', 'EUR', 'GBP']
    annual_return: float = Field(ge=-50, le=50)
    annual_fee: float = Field(ge=0, le=10)

    @model_validator(mode='after')
    def positive_savings(self):
        if self.initial_amount == 0 and self.monthly_contribution == 0:
            raise ValueError('Starting amount or monthly contribution must be positive.')
        return self


class PlanningPoint(BaseModel):
    year: int
    contributed: float
    before_fees: float
    after_fees: float


class PlanningResult(BaseModel):
    inputs: PlanningInput
    total_contributed: float
    ending_value: float
    growth: float
    fee_impact: float
    goal_gap: float | None
    series: list[PlanningPoint]
    assumptions: str
