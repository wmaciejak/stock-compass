from dataclasses import dataclass, field
import os


@dataclass(frozen=True)
class AiConfig:
    enabled: bool
    disabled_reason: str | None
    api_key: str = field(default='', repr=False)
    model: str = 'gpt-6-luna'
    reasoning: str = 'high'
    max_output_tokens: int = 12000
    timeout_seconds: float = 240
    max_context_bytes: int = 2000000
    max_request_tokens: int = 190000

    def public_status(self):
        return dict(enabled=self.enabled, reason=self.disabled_reason, model=self.model,
                    reasoning=self.reasoning, max_output_tokens=self.max_output_tokens,
                    max_request_tokens=self.max_request_tokens)


def load_ai_config(*, offline: bool) -> AiConfig:
    key = os.environ.get('OPENAI_API_KEY', '').strip()
    enabled = os.environ.get('STOCK_COMPASS_AI_ENABLED') == '1'
    reason = 'ai_offline' if offline else 'ai_disabled' if not enabled else 'missing_key' if not key else None
    reasoning = os.environ.get('STOCK_COMPASS_AI_REASONING', 'high')
    tokens = int(os.environ.get('STOCK_COMPASS_AI_MAX_OUTPUT_TOKENS', '12000'))
    timeout = float(os.environ.get('STOCK_COMPASS_AI_TIMEOUT_SECONDS', '240'))
    budget = int(os.environ.get('STOCK_COMPASS_AI_MAX_CONTEXT_BYTES', '2000000'))
    request_budget = int(os.environ.get('STOCK_COMPASS_AI_MAX_REQUEST_TOKENS', '190000'))
    if reasoning not in ('low','medium','high','xhigh','max') or not 1 <= tokens <= 128000 or not 0 < timeout <= 900 or not 0 < budget <= 10000000:
        raise ValueError('Invalid STOCK_COMPASS_AI reasoning, timeout, output token or context limit.')
    model = os.environ.get('STOCK_COMPASS_AI_MODEL', 'gpt-6-luna').strip()
    if not model or len(model) > 100:
        raise ValueError('Invalid STOCK_COMPASS_AI_MODEL.')
    if not tokens < request_budget <= 10000000:
        raise ValueError('Invalid STOCK_COMPASS_AI_MAX_REQUEST_TOKENS; it must exceed the output token allowance.')
    return AiConfig(reason is None, reason, key, model, reasoning, tokens, timeout, budget, request_budget)
