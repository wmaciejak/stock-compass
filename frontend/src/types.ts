export const HORIZONS = [
  "1–2 weeks",
  "2–8 weeks",
  "1–6 months",
  "6–12 months",
] as const;
export type Bar = {
  time: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number | null;
  [key: string]: number | string | null;
};
export type Scenario = {
  entry: number;
  entry_max: number;
  stop: number;
  target: number;
  reward_risk: number;
  trigger: string;
  basis: string;
};
export type Availability = {
  status: string;
  reason?: string;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  retrieved_at?: string;
};
export type SessionQuote = {
  price: number;
  previous_close: number;
  change_percent: number;
  market_time: string;
  session: string;
  source: string;
  price_basis: "provider_native";
  delay: "unknown";
};
export type Analysis = {
  beginner?: BeginnerReading | null;
  earnings?: EarningsRow | null;
  instrument: {
    symbol: string;
    name: string;
    exchange: string;
    currency: string;
    instrument_type: string;
    synthetic: boolean;
    timezone: string;
  };
  provenance: {
    source: string;
    retrieved_at: string;
    last_completed_bar: string;
    expected_completed_bar: string;
    exchange_timezone: string;
    price_basis: string;
    cache: boolean;
    synthetic: boolean;
    publication_allowance_minutes: number;
  };
  assessment: {
    label: string;
    horizon: string;
    horizon_scope: string;
    rule_version: string;
    timestamp: string;
    data_quality: {
      actionable: boolean;
      stale: boolean;
      issues: string[];
      bars: number;
    };
    supporting: string[];
    opposing: string[];
    summary: string;
    next_condition: string;
    event_risk: string;
    score: number;
    contributions: Contribution[];
    scenario: Scenario | null;
    strategy_signals: Record<string, unknown>;
  };
  metrics: Record<string, number | null>;
  bars: Bar[];
  zones: Array<{
    kind: string;
    price: number;
    low: number;
    high: number;
    touches: number;
    available_date: string;
  }>;
  weekly: {
    status: string;
    trend: string;
    last_bar: string;
    sma20?: number;
    meaning?: string;
  };
  relative: {
    status: string;
    reason?: string;
    benchmark: string;
    returns: Record<
      string,
      {
        stock: number;
        benchmark: number;
        excess: number;
        start: string;
        end: string;
      } | null
    >;
    series: Array<{ time: string; stock: number; benchmark: number }>;
    meaning?: string;
  };
  education: Array<{
    key: string;
    name: string;
    measures: string;
    reading: number | null;
    role: string;
    mistake: string;
    url: string;
  }>;
  patterns: Array<{ name: string; direction: string; context: string }>;
  context: Record<string, Availability>;
  changes: string[];
  benchmark: string;
  engine: string;
  lessons: Array<{ title: string; text: string; url: string }>;
  terms: Record<string, string>;
};
export type Contribution = {
  group: string;
  points: number;
  maximum: number;
  reason: string;
};
export type Watch = {
  earnings?: EarningsRow | null;
  symbol: string;
  status: string;
  reason?: string;
  instrument?: Analysis["instrument"];
  close?: number;
  change?: number;
  quote?: SessionQuote | null;
  trend?: string;
  label?: string;
  score: number;
  contributions?: Contribution[];
  event_risk?: string;
  timestamp?: string;
  provenance?: Analysis["provenance"];
  changes?: string[];
};
export type Settings = {
  experience: "beginner" | "advanced";
  preferred_workspace: "research" | "long_term";
  language: "en" | "pl";
  mode: "demo" | "live";
  benchmark: string;
  horizon: string;
  commission: number;
  spread: number;
};

export type SizingInput = {
  account: number;
  account_currency: string;
  entry: number;
  stop: number;
  risk_percent: number;
  instrument_currency: string;
  conversion_rate: number | null;
  conversion_date: string | null;
};
export type BrowserResearch = {
  note_draft: string | null;
  thesis_draft: string | null;
  sizing_input: SizingInput | null;
  sizing_form: Record<string, string> | null;
  comparison_symbols: string[];
};
export type AiStatus = {
  enabled: boolean;
  reason: string | null;
  model: string;
  active_run?: {
    id: string;
    symbol: string;
    horizon: string;
    language: string;
  } | null;
};
export type AiClaim = { text: string; source_refs: string[] };
export type AiLevel = {
  label: string;
  role: string;
  value: number;
  source_ref: string;
  interval: string;
  price_basis: string;
};
export type AiScenario = {
  kind: string;
  outlook: AiClaim;
  confirmation: AiClaim;
  invalidation: AiClaim;
  levels: AiLevel[];
  events: AiClaim[];
};
export type AiResult = {
  content: {
    symbol: string;
    horizon: string;
    language: string;
    summary: AiClaim;
    recommendation: string;
    rationale: AiClaim[];
    counterargument: AiClaim;
    confidence: string;
    confidence_reason: AiClaim;
    near_term: AiClaim;
    scenarios: AiScenario[];
    best_supported_scenario: string;
    next_observations: AiClaim[];
    risks: AiClaim[];
    missing_context: string[];
  };
  model: string;
  generated_at: string;
  response_id: string;
  usage: Record<string, number>;
  fingerprint: string;
  browser_context: BrowserResearch;
  prompt_version: string;
  source_dates: Record<
    string,
    { retrieved_at?: string; last_completed_bar?: string }
  >;
  manifest: Array<{
    name: string;
    status: string;
    reason?: string;
    count: number;
    bytes: number;
    first_date?: string;
    last_date?: string;
  }>;
  evidence: Record<
    string,
    {
      label: string;
      path: string;
      value: unknown;
      interval?: string;
      price_basis?: string;
    }
  >;
};
export type AiRun = {
  id: string;
  symbol: string;
  horizon: string;
  language: string;
  state: string;
  created_at: string;
  updated_at: string;
  result: AiResult | null;
  error: {
    code: string;
    message: string;
    diagnostics?: Record<string, string | number>;
  } | null;
  context_changed: boolean;
  reused_from?: string | null;
};
export type Metrics = {
  total_return: number;
  cagr: number | null;
  max_drawdown: number;
  trades: number;
  win_rate: number | null;
  expectancy: number | null;
  profit_factor: number | null;
  exposure: number | null;
  open_positions: number;
  equity_final: number;
};
export type Backtest = {
  strategy: string;
  metrics: Metrics;
  baseline_metrics: Metrics;
  equity: Array<{ time: string; strategy: number; baseline: number }>;
  trades: Array<{
    entry_date: string;
    exit_date: string;
    entry: number;
    exit: number;
    shares: number;
    net_pnl: number;
  }>;
  periods: Period[];
  holdout: Period;
  dates: { start: string; end: string; sessions: number; warmup: number };
  assumptions: Record<string, string | number>;
  conclusion: string;
  evidence: string;
  synthetic: boolean;
  rule_version: string;
};
export type Period = {
  name: string;
  start: string;
  end: string;
  sessions: number;
  strategy_return: number;
  baseline_return: number;
  meaning: string;
};
export type Idea = {
  id: number;
  symbol: string;
  thesis: string;
  outcome: string;
  created_at: string;
  analysis_id: number | null;
};

export type HourlyChart = {
  symbol: string;
  interval: "1h";
  synthetic: boolean;
  engine: string;
  bars: Array<{
    time: number;
    Open: number;
    High: number;
    Low: number;
    Close: number;
    Volume: number | null;
    [key: string]: number | string | null;
  }>;
  zones: Analysis["zones"];
  source: string;
  price_basis: string;
  retrieved_at: string;
  exchange_timezone: string;
  last_completed_bar: string;
  last_completed_end: string;
  cache: boolean;
  publication_allowance_minutes: number;
  quality: {
    stale: boolean;
    issues: string[];
    provisional_bars: number;
    bars: number;
    expected_completed_bar: string | null;
  };
};

export type BeginnerReading = {
  conclusion: string;
  explanation: string;
  caution_kind:
    "data" | "earnings" | "event_unknown" | "opposing" | "uncertainty";
  caution: string;
  next_condition: string;
  supporting: string[];
};
export type Onboarding = {
  version: 1;
  path: "research" | "long_term";
  step: number;
  state: "active" | "dismissed" | "complete";
};
export type PlanningInput = {
  goal_name: string;
  target_amount: number | null;
  initial_amount: number;
  monthly_contribution: number;
  years: number;
  currency: "USD" | "PLN" | "EUR" | "GBP";
  annual_return: number;
  annual_fee: number;
};
export type PlanningResult = {
  inputs: PlanningInput;
  total_contributed: number;
  ending_value: number;
  growth: number;
  fee_impact: number;
  goal_gap: number | null;
  assumptions: string;
  series: Array<{
    year: number;
    contributed: number;
    before_fees: number;
    after_fees: number;
  }>;
};
export type EarningsRow = {
  symbol: string;
  name: string;
  kind: "earnings";
  status: "estimated" | "unknown" | "not_applicable";
  date_start: string | null;
  date_end: string | null;
  date_basis: string | null;
  exchange_timezone: string | null;
  source: string | null;
  retrieved_at: string | null;
  freshness: "fresh" | "stale" | "unknown";
  reason_code: string | null;
  last_reported_date: string | null;
  refresh_error: Record<string, unknown> | null;
  in_window: boolean;
};
export type EventsResponse = {
  generated_at: string;
  mode: "demo" | "live";
  offline: boolean;
  freshness_hours: number;
  rows: EarningsRow[];
};
