import httpx
import pytest
from openai import OpenAI

from compass.ai.client import generate_summary
from compass.ai.config import AiConfig
from compass.ai.context import context_json
from compass.ai.models import AiContext, AiError, EvidenceSource


def captured_context():
    return AiContext(payload={'request':{'symbol':'TEST','horizon':'2–8 weeks','language':'en'},
        'daily':{'assessment':{'scenario':None}},'note':'private research ż'},
        evidence={'note':EvidenceSource(label='Note',category='research',path='note',value='private research ż')},
        manifest=[],fingerprint='test',daily_actionable=False)


@pytest.mark.parametrize('provider_code,provider_type,expected', [
    ('credit_balance_exhausted', 'insufficient_quota', 'credit_balance_exhausted'),
    ('organization_spend_limit_exceeded', 'insufficient_quota', 'organization_spend_limit_exceeded'),
    ('project_spend_limit_exceeded', 'insufficient_quota', 'project_spend_limit_exceeded'),
    ('organization_usage_limit_exceeded', 'insufficient_quota', 'organization_usage_limit_exceeded'),
    ('insufficient_quota', 'insufficient_quota', 'quota_exceeded'),
    (None, 'insufficient_quota', 'quota_exceeded'),
    ('new_billing_code', 'insufficient_quota', 'quota_exceeded'),
    ('rate_limit_exceeded', 'rate_limit_error', 'request_rate_limited'),
    ('rate_limit_exceeded', 'insufficient_quota', 'request_rate_limited'),
    ('slow_down', 'rate_limit_error', 'request_rate_limited'),
    (None, 'rate_limit_error', 'request_rate_limited'),
    (None, None, 'api_limit_unknown'),
    ('unknown-test-secret', None, 'api_limit_unknown'),
])
def test_sdk_429_codes_identify_billing_and_throughput_without_retry(provider_code, provider_type, expected):
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(429, json={'error': {
            'message': 'test-secret provider message must stay private',
            'code': provider_code, 'type': provider_type,
        }})
    context = captured_context()
    config = AiConfig(enabled=True, disabled_reason=None, api_key='test-secret')
    with OpenAI(api_key='test-secret', max_retries=0,
                http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        with pytest.raises(AiError) as exc:
            generate_summary(context, None, config, client=sdk)
    assert exc.value.code == expected
    assert 'test-secret' not in str(exc.value)
    assert len(calls) == 1


def test_non_object_429_body_is_safe_and_remains_unknown():
    def respond(request):
        return httpx.Response(429, json=['test-secret raw response'])
    context = captured_context()
    config = AiConfig(enabled=True, disabled_reason=None, api_key='test-secret')
    with OpenAI(api_key='test-secret', max_retries=0,
                http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        with pytest.raises(AiError) as exc:
            generate_summary(context, None, config, client=sdk)
    assert exc.value.code == 'api_limit_unknown'
    assert 'test-secret' not in str(exc.value)


def sdk_limit_failure(message, headers):
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(429, headers=headers, json={'error': {
            'message': message, 'code': 'rate_limit_exceeded', 'type': 'rate_limit_error',
        }})
    context = captured_context()
    config = AiConfig(enabled=True, disabled_reason=None, api_key='test-secret')
    with OpenAI(api_key='test-secret', max_retries=0,
                http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        with pytest.raises(AiError) as exc:
            generate_summary(context, None, config, client=sdk)
    assert len(calls) == 1
    return exc.value, context


def test_rate_limit_diagnostics_keep_request_id_and_safe_header_counts():
    error, context = sdk_limit_failure('private provider message org-private', {
        'x-request-id': 'req_test123', 'retry-after': '56.5',
        'x-ratelimit-limit-tokens': '30000', 'x-ratelimit-remaining-tokens': '0',
        'x-ratelimit-limit-requests': '60', 'x-ratelimit-remaining-requests': '59',
        'x-ratelimit-limit-project-tokens': '20000', 'x-ratelimit-remaining-project-tokens': '1000',
        'x-ratelimit-reset-tokens': '6m0s', 'x-ratelimit-reset-requests': '1s',
        'x-ratelimit-reset-project-tokens': '3s', 'authorization': 'test-secret',
    })
    assert error.code == 'request_rate_limited'
    assert error.diagnostics == {
        'request_id': 'req_test123', 'retry_after_seconds': 56.5,
        'token_limit': 30000, 'remaining_tokens': 0, 'request_limit': 60, 'remaining_requests': 59,
        'project_token_limit': 20000, 'remaining_project_tokens': 1000,
        'token_reset': '6m0s', 'request_reset': '1s', 'project_token_reset': '3s',
        'input_context_bytes': len(context_json(context).encode()), 'max_output_tokens': 12000,
    }
    assert 'private' not in str(error.diagnostics)
    assert 'test-secret' not in str(error.diagnostics)


@pytest.mark.parametrize('counts,expected,requested', [
    ('Limit 30000, Requested 280000', 'request_too_large', 280000),
    ('Limit 30000, Used 29000, Requested 12000', 'request_rate_limited', 12000),
])
def test_only_a_request_exceeding_the_entire_token_limit_is_too_large(counts, expected, requested):
    error, _ = sdk_limit_failure(
        f'Request too large for gpt-6.1-sol in organization org-private on tokens per min (TPM): {counts}. test-secret', {})
    assert error.code == expected
    assert error.diagnostics['token_limit'] == 30000
    assert error.diagnostics['requested_tokens'] == requested
    assert 'org-private' not in str(error)
    assert 'test-secret' not in str(error.diagnostics)


def test_malformed_or_unbounded_limit_headers_are_not_exposed():
    error, context = sdk_limit_failure('test-secret raw response', {
        'x-request-id': 'raw-secret-value', 'retry-after': 'inf',
        'x-ratelimit-limit-tokens': '100000000000000000000',
        'x-ratelimit-remaining-tokens': '-1', 'x-ratelimit-limit-requests': 'test-secret',
        'x-ratelimit-reset-tokens': '6m0s secret',
    })
    assert error.diagnostics == {'input_context_bytes': len(context_json(context).encode()), 'max_output_tokens': 12000}


def test_unbounded_message_counts_do_not_produce_a_false_input_size():
    error, _ = sdk_limit_failure('tokens per min (TPM): Limit 30000, Requested 100000000000000000000', {})
    assert 'requested_tokens' not in error.diagnostics
    assert error.code == 'request_rate_limited'
