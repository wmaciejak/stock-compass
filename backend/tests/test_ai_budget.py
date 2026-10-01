import json
import httpx
import pytest
from openai import OpenAI
from compass.ai.config import AiConfig
from compass.ai.models import AiContext, AiError, EvidenceSource


def checker():
    from compass.ai import client
    check = getattr(client,'check_request_budget',None)
    assert callable(check), 'Exact pre-generation token budget check is missing'
    return check


def context():
    return AiContext(payload={'request':{'symbol':'TEST','horizon':'2–8 weeks','language':'en'},
                             'daily':{'assessment':{'scenario':None}},'research':{'saved_note':'Private fixture note'}},
        evidence={'research.saved_note':EvidenceSource(label='Note',category='research',path='research.saved_note',value='Private fixture note')},
        manifest=[],fingerprint='test',daily_actionable=False)


def config():
    return AiConfig(True,None,api_key='test-secret')


def test_exact_count_at_budget_boundary_includes_output_and_schema():
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'input_tokens':178000,'object':'response.input_tokens'})
    with OpenAI(api_key='test-secret',max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        assert checker()(context(),config(),client=sdk)==178000
    assert len(calls)==1 and calls[0].url.path=='/v1/responses/input_tokens'
    body=json.loads(calls[0].content)
    assert body['model']=='gpt-6-luna' and body['reasoning']=={'effort':'high'}
    assert body['text']['format']['type']=='json_schema'
    assert body['text']['format']['strict'] is True
    assert 'Private fixture note' in body['input'][1]['content']
    assert 'test-secret' not in str(body)


def test_oversize_count_rejects_before_generation():
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'input_tokens':178001,'object':'response.input_tokens'})
    with OpenAI(api_key='test-secret',max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        with pytest.raises(AiError) as failure:
            checker()(context(),config(),client=sdk)
    assert failure.value.code=='context_token_budget_exceeded'
    assert failure.value.diagnostics['requested_tokens']==190001
    assert failure.value.diagnostics['request_token_budget']==190000
    assert failure.value.diagnostics['input_tokens']==178001
    assert not failure.value.delivery_unknown
    assert len(calls)==1 and calls[0].url.path=='/v1/responses/input_tokens'


def test_failed_count_never_becomes_unknown_generation_delivery():
    calls=[]
    def respond(request):
        calls.append(request)
        raise httpx.ReadTimeout('test-secret',request=request)
    with OpenAI(api_key='test-secret',max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        with pytest.raises(AiError) as failure:
            checker()(context(),config(),client=sdk)
    assert failure.value.code=='token_count_unavailable'
    assert not failure.value.delivery_unknown
    assert 'test-secret' not in str(failure.value)
    assert len(calls)==1
