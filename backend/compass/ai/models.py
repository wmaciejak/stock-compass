from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from compass.models import Horizon, SizingInput


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class BrowserContext(StrictModel):
    note_draft: str | None = Field(default=None, max_length=10000)
    thesis_draft: str | None = Field(default=None, max_length=10000)
    sizing_input: SizingInput | None = None
    sizing_form: dict[str, str] | None = None
    comparison_symbols: list[str] = Field(default_factory=list, max_length=4)

    @field_validator('sizing_form')
    @classmethod
    def form_fields(cls, value):
        allowed = {'account','account_currency','entry','stop','risk','rate','date'}
        if value is not None and (set(value) - allowed or any(len(v) > 64 for v in value.values())):
            raise ValueError('Invalid sizing form fields.')
        return value


class AiSummaryRequest(StrictModel):
    client_request_id: UUID
    horizon: Horizon
    language: Literal['en','pl']
    mode: Literal['demo','live']
    force: bool = False
    browser_context: BrowserContext = Field(default_factory=BrowserContext)


class EvidenceSource(StrictModel):
    label: str
    category: str
    path: str
    value: object
    kind: Literal['fact','price'] = 'fact'
    interval: str | None = None
    price_basis: str | None = None


class ContextSection(StrictModel):
    name: str
    status: str
    reason: str | None = None
    count: int = 0
    first_date: str | None = None
    last_date: str | None = None
    bytes: int = 0


class AiContext(StrictModel):
    payload: dict
    evidence: dict[str, EvidenceSource]
    manifest: list[ContextSection]
    fingerprint: str
    daily_actionable: bool


class AiClaim(StrictModel):
    text: str
    source_refs: list[str]


class AiLevel(StrictModel):
    label: str
    role: Literal['support','resistance','entry','entry_max','stop','target','observation']
    value: float
    source_ref: str
    interval: Literal['1d','1h']
    price_basis: str


class AiScenario(StrictModel):
    kind: Literal['base','bull','bear']
    outlook: AiClaim
    confirmation: AiClaim
    invalidation: AiClaim
    levels: list[AiLevel]
    events: list[AiClaim]


class AiSummaryContent(StrictModel):
    symbol: str
    horizon: Horizon
    language: Literal['en','pl']
    summary: AiClaim
    recommendation: Literal['consider_buy_setup','wait_for_confirmation','avoid_new_entry','insufficient_data']
    rationale: list[AiClaim]
    counterargument: AiClaim
    confidence: Literal['low','moderate','high']
    confidence_reason: AiClaim
    near_term: AiClaim
    scenarios: list[AiScenario]
    best_supported_scenario: Literal['base','bull','bear']
    next_observations: list[AiClaim]
    risks: list[AiClaim]
    missing_context: list[str]


class AiSummary(StrictModel):
    content: AiSummaryContent
    generated_at: str
    model: str
    response_id: str
    usage: dict
    prompt_version: str
    schema_version: str
    fingerprint: str
    source_dates: dict
    manifest: list[ContextSection]
    browser_context: BrowserContext
    evidence: dict[str, EvidenceSource] = Field(default_factory=dict)


class AiRunView(StrictModel):
    id: str
    symbol: str
    horizon: str
    language: str
    state: Literal['preparing','running','succeeded','failed','interrupted','delivery_unknown']
    created_at: str
    updated_at: str
    result: AiSummary | None = None
    error: dict | None = None
    context_changed: bool = False
    reused_from: str | None = None


class AiError(Exception):
    def __init__(self, code, message, *, delivery_unknown=False, diagnostics=None):
        super().__init__(message)
        self.code = code
        self.delivery_unknown = delivery_unknown
        self.diagnostics = diagnostics or {}
