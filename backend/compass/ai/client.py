from pathlib import Path
import math
import re
from compass.normalization import utcnow
from .context import context_json, PROMPT_VERSION, SCHEMA_VERSION
from .models import AiError, AiSummary, AiSummaryContent, AiScenario, AiClaim, AiLevel
from .output import output_contract


def _limit_diagnostics(error, detail):
    """Retain only bounded IDs/numbers/durations, never raw messages or headers."""
    diagnostics = {}
    headers = getattr(getattr(error, 'response', None), 'headers', {})
    request_id = getattr(error, 'request_id', None) or headers.get('x-request-id')
    if isinstance(request_id, str) and re.fullmatch(r'req_[A-Za-z0-9_-]{1,128}', request_id):
        diagnostics['request_id'] = request_id

    def count(value):
        if isinstance(value, str) and re.fullmatch(r'\d{1,13}', value) and int(value) <= 10**12:
            return int(value)
        return None

    for name, field in {
        'tokens': 'token_limit', 'requests': 'request_limit', 'project-tokens': 'project_token_limit',
    }.items():
        value = count(headers.get(f'x-ratelimit-limit-{name}'))
        if value is not None:
            diagnostics[field] = value
    for name, field in {
        'tokens': 'remaining_tokens', 'requests': 'remaining_requests', 'project-tokens': 'remaining_project_tokens',
    }.items():
        value = count(headers.get(f'x-ratelimit-remaining-{name}'))
        if value is not None:
            diagnostics[field] = value
    for name, field in {
        'tokens': 'token_reset', 'requests': 'request_reset', 'project-tokens': 'project_token_reset',
    }.items():
        value = headers.get(f'x-ratelimit-reset-{name}')
        if isinstance(value, str) and len(value) <= 80 and re.fullmatch(r'(?:\d+(?:\.\d+)?(?:ms|s|m|h|d)){1,6}', value):
            diagnostics[field] = value
    try:
        delay = float(headers.get('retry-after', ''))
        if math.isfinite(delay) and 0 <= delay <= 604800:
            diagnostics['retry_after_seconds'] = delay
    except (ValueError, TypeError):
        pass

    # OpenAI's TPM error text can supply counts absent from the headers. Extract
    # only the numeric clause; organization IDs and the rest of the body stay private.
    message = detail.get('message')
    if isinstance(message, str) and len(message) <= 10000:
        match = re.search(r'tokens per min(?:ute)?\s*\(TPM\):\s*Limit (\d{1,13}),\s*(?:Used (\d{1,13}),\s*)?Requested (\d{1,13})(?!\d)', message, re.I)
        if match:
            for field, value in zip(('token_limit', 'used_tokens', 'requested_tokens'), match.groups()):
                parsed = count(value)
                if parsed is not None:
                    diagnostics[field] = parsed
    return diagnostics


def limit_error(error, *, input_context_bytes=None, max_output_tokens=None):
    """Classify documented 429 details without exposing the provider body."""
    body = getattr(error, 'body', None)
    detail = body.get('error', body) if isinstance(body, dict) else {}
    detail = detail if isinstance(detail, dict) else {}
    diagnostics = _limit_diagnostics(error, detail)
    if input_context_bytes is not None:
        diagnostics['input_context_bytes'] = input_context_bytes
    if max_output_tokens is not None:
        diagnostics['max_output_tokens'] = max_output_tokens
    def failure(code, message):
        return AiError(code, message, diagnostics=diagnostics)
    code = getattr(error, 'code', None) or detail.get('code')
    kind = getattr(error, 'type', None) or detail.get('type')
    code = code if isinstance(code, str) else None
    kind = kind if isinstance(kind, str) else None
    billing = {
        'credit_balance_exhausted': 'OpenAI API credits are exhausted. Add credits in OpenAI billing before generating again.',
        'organization_spend_limit_exceeded': 'This OpenAI organization reached its spending limit. Review the organization limit before generating again.',
        'project_spend_limit_exceeded': 'This OpenAI project reached its spending limit. Review the project limit before generating again.',
        'organization_usage_limit_exceeded': 'This OpenAI organization reached its approved usage limit. Request a higher limit or contact OpenAI support.',
    }
    if code in billing:
        return failure(code, billing[code])
    if code == 'insufficient_quota' or (kind == 'insufficient_quota' and code not in ('rate_limit_exceeded', 'slow_down')):
        return failure('quota_exceeded', 'OpenAI API quota is unavailable. Check API credits and spending limits before generating again.')
    if code in ('rate_limit_exceeded', 'slow_down') or kind == 'rate_limit_error':
        if diagnostics.get('requested_tokens', 0) > diagnostics.get('token_limit', math.inf):
            return failure('request_too_large', 'This request exceeds the entire token rate limit. Waiting alone will not make it fit. Raise the model/project token limit or reduce the input context.')
        return failure('request_rate_limited', 'OpenAI request/token rate limit reached. Check API limits; wait before retrying if temporary, or raise the token limit if this request is too large.')
    return failure('api_limit_unknown', 'OpenAI returned HTTP 429 without a recognized limit code. Check billing and API limits.')


def validate_summary(content, context, request):
    def invalid(rule, field):
        raise AiError('invalid_result','AI output does not match the captured evidence or data-quality rules.',
                      diagnostics=dict(validation_rule=rule,output_field=field))
    if (content.symbol,content.horizon,content.language)!=(context.payload['request']['symbol'],request.horizon,request.language):
        invalid('identity_mismatch','request')
    if len(content.scenarios)!=3 or {s.kind for s in content.scenarios}!={'base','bull','bear'}:
        invalid('scenario_set_mismatch','scenarios')
    daily=context.payload['daily']
    scenario=daily['assessment']['scenario']
    if not context.daily_actionable and content.recommendation!='insufficient_data':
        invalid('daily_quality_restricted','recommendation')
    if content.recommendation=='consider_buy_setup' and (not context.daily_actionable or not scenario):
        invalid('buy_setup_unavailable','recommendation')
    def walk(value, path=''):
        if isinstance(value,dict):
            if 'source_refs' in value:
                if not value['source_refs']:
                    invalid('missing_claim_evidence',f'{path}.source_refs')
                if any(ref not in context.evidence for ref in value['source_refs']):
                    invalid('unknown_evidence_reference',f'{path}.source_refs')
            for key,child in value.items():
                walk(child,f'{path}.{key}' if path else key)
        elif isinstance(value,list):
            for index,child in enumerate(value): walk(child,f'{path}.{index}')
    walk(content.model_dump())
    for scene_index,scene in enumerate(content.scenarios):
        for level_index,level in enumerate(scene.levels):
            field=f'scenarios.{scene_index}.levels.{level_index}'
            source=context.evidence.get(level.source_ref)
            if (not source or source.kind!='price' or isinstance(source.value,bool) or not isinstance(source.value,(float,int))
                or not math.isfinite(level.value)):
                invalid('invalid_price_source',field)
            if level.value!=source.value:
                invalid('price_value_mismatch',f'{field}.value')
            if level.interval!=source.interval:
                invalid('price_interval_mismatch',f'{field}.interval')
            if level.price_basis!=source.price_basis:
                invalid('price_basis_mismatch',f'{field}.price_basis')
            if level.role in ('entry','entry_max','stop','target'):
                if not context.daily_actionable or not scenario or level.source_ref!=f'daily.assessment.scenario.{level.role}':
                    invalid('unsupported_trading_level',f'{field}.role')


def _response_diagnostics(response):
    diagnostics={}
    response_id=getattr(response,'id',None)
    if isinstance(response_id,str) and re.fullmatch(r'resp_[A-Za-z0-9_-]{1,128}',response_id):
        diagnostics['response_id']=response_id
    usage=getattr(response,'usage',None)
    usage=usage.model_dump() if hasattr(usage,'model_dump') else usage
    if isinstance(usage,dict):
        for field in ('input_tokens','output_tokens','total_tokens'):
            value=usage.get(field)
            if isinstance(value,int) and not isinstance(value,bool) and 0 <= value <= 10**12:
                diagnostics[field]=value
    return diagnostics


def _validation_field(error):
    """Keep schema field names and bounded indexes, never unknown model keys."""
    fields={'base','bull','bear'}
    for model in (AiSummaryContent,AiScenario,AiClaim,AiLevel):
        fields.update(model.model_fields)
    location=error.errors(include_input=False,include_url=False)[0].get('loc',())
    parts=[str(part) for part in location if (isinstance(part,str) and part in fields)
           or (isinstance(part,int) and not isinstance(part,bool) and 0 <= part <= 10000)]
    return '.'.join(parts)[:240] or 'response'


def check_request_budget(context, config, *, client=None):
    """Count the actual structured request before sending it for generation."""
    from openai import OpenAI
    from openai.lib._parsing._responses import type_to_text_format_param
    contract=output_contract(context)
    owned = client is None
    if owned:
        client = OpenAI(api_key=config.api_key,timeout=min(config.timeout_seconds,30),max_retries=0)
    serialized = context_json(context)
    try:
        counted = client.responses.input_tokens.count(
            model=config.model, reasoning={'effort':config.reasoning},
            input=[dict(role='developer',content=Path(__file__).with_name('prompt.md').read_text()),
                   dict(role='user',content=serialized)],
            text={'format':type_to_text_format_param(contract.schema)})
        tokens = counted.input_tokens
        if isinstance(tokens,bool) or not isinstance(tokens,int) or not 0 <= tokens <= 10**12:
            raise ValueError('Invalid token count')
    except Exception as error:
        status=getattr(error,'status_code',None)
        if status in (401,403):
            raise AiError('authentication_failed','OpenAI credentials or model permissions were rejected.') from None
        if status==404:
            raise AiError('model_unavailable','The configured model is unavailable for this API account.') from None
        if status==429:
            raise limit_error(error,input_context_bytes=len(serialized.encode()),max_output_tokens=config.max_output_tokens) from None
        raise AiError('token_count_unavailable','OpenAI token count could not be checked. No summary was generated.') from None
    finally:
        if owned:
            client.close()
    if tokens+config.max_output_tokens > config.max_request_tokens:
        raise AiError('context_token_budget_exceeded',
            'AI input exceeds the configured request token budget. No summary was generated.',
            diagnostics=dict(input_tokens=tokens,max_output_tokens=config.max_output_tokens,
                             requested_tokens=tokens+config.max_output_tokens,request_token_budget=config.max_request_tokens,
                             input_context_bytes=len(serialized.encode())))
    return tokens


def generate_summary(context, request, config, *, client=None):
    if not config.enabled:
        raise AiError(config.disabled_reason or 'ai_disabled','AI is not configured or is offline.')
    contract=output_contract(context)
    if client is None:
        from openai import OpenAI
        client=OpenAI(api_key=config.api_key,timeout=config.timeout_seconds,max_retries=0)
    prompt=Path(__file__).with_name('prompt.md').read_text()
    serialized_context=context_json(context)
    from openai.lib._parsing._responses import type_to_text_format_param
    try:
        # Capture the typed response envelope before validating generated JSON,
        # so a rejected result still retains safe response/usage diagnostics.
        response=client.responses.create(model=config.model,reasoning={'effort':config.reasoning},
            input=[dict(role='developer',content=prompt),dict(role='user',content=serialized_context)],
            text={'format':type_to_text_format_param(contract.schema)},max_output_tokens=config.max_output_tokens,store=False)
    except Exception as e:
        status=getattr(e,'status_code',None)
        name=type(e).__name__
        if status==401 or status==403:
            raise AiError('authentication_failed','OpenAI credentials or model permissions were rejected.') from None
        if status==404:
            raise AiError('model_unavailable','The configured model is unavailable for this API account.') from None
        if status==429:
            raise limit_error(e, input_context_bytes=len(serialized_context.encode()), max_output_tokens=config.max_output_tokens) from None
        if status==400:
            raise AiError('invalid_result','OpenAI rejected the model request or context. Check model compatibility and input limits.') from None
        if 'Timeout' in name or 'Connection' in name or isinstance(e,TimeoutError):
            raise AiError('delivery_unknown','OpenAI delivery is unknown. The request may have been billed; regenerating starts a new request.',delivery_unknown=True) from None
        if 'LengthFinishReason' in name:
            raise AiError('incomplete_result','OpenAI did not finish within the output limit.') from None
        if 'Validation' in name or 'JSON' in name:
            raise AiError('invalid_result','OpenAI returned an invalid structured result.',
                          diagnostics=dict(validation_rule='structured_output_mismatch')) from None
        raise AiError('provider_unavailable','OpenAI could not complete this request. No automatic retry was made.') from None
    for output in getattr(response,'output',[]):
        for part in getattr(output,'content',[]):
            if getattr(part,'type',None)=='refusal':
                raise AiError('refused','OpenAI declined this request.')
    if response.status!='completed':
        raise AiError('incomplete_result','OpenAI returned an incomplete result.')
    from pydantic import ValidationError
    try:
        parsed=contract.schema.model_validate_json(response.output_text)
        content=contract.resolve(parsed)
        validate_summary(content,context,request)
    except ValidationError as error:
        raise AiError('invalid_result','OpenAI returned an invalid structured result.',
                      diagnostics=dict(validation_rule='structured_output_mismatch',output_field=_validation_field(error),
                                       **_response_diagnostics(response))) from None
    except AiError as error:
        error.diagnostics.update(_response_diagnostics(response))
        raise
    usage=response.usage.model_dump(mode='json') if hasattr(response.usage,'model_dump') else (response.usage or {})
    return AiSummary(content=content,generated_at=utcnow().isoformat(),model=response.model,response_id=response.id,usage=usage,
        prompt_version=PROMPT_VERSION,schema_version=SCHEMA_VERSION,fingerprint=context.fingerprint,
        source_dates={k:{'retrieved_at':context.payload[k].get('provenance',{}).get('retrieved_at',context.payload[k].get('retrieved_at')),'last_completed_bar':context.payload[k].get('provenance',{}).get('last_completed_bar',context.payload[k].get('last_completed_bar'))} for k in ('daily','hourly','benchmark')},
        manifest=context.manifest,browser_context=request.browser_context,evidence=context.evidence)
