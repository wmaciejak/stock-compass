from pathlib import Path
from dataclasses import replace
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import pytest
from compass.persistence import Store
from compass.service import ResearchService
from compass.ai.config import load_ai_config
from compass.ai.models import AiSummaryRequest, AiError
from ai_helpers import RecordingClient


def jobs_module():
    assert (Path(__file__).parents[1]/'compass/ai/jobs.py').exists(), 'Persistent AI jobs are missing'
    from compass.ai.jobs import AiJobs
    return AiJobs


@pytest.fixture
def jobs(tmp_path):
    cls=jobs_module()
    store=Store(tmp_path/'jobs.sqlite')
    sdk=RecordingClient()
    config=replace(load_ai_config(offline=False),enabled=True,disabled_reason=None,api_key='test')
    return cls(store,ResearchService(store),config,sdk),sdk


def req(**changes):
    values=dict(client_request_id=uuid4(),horizon='2–8 weeks',language='en',mode='demo')
    values.update(changes)
    return AiSummaryRequest(**values)


def test_uuid_replay_cache_and_force_are_persistent(jobs):
    jobs,sdk=jobs
    request=req()
    first=jobs.submit('DEMO_TREND',request)
    assert first.state=='preparing'
    assert jobs.submit('DEMO_TREND',request).id==first.id
    jobs.execute(first.id)
    assert jobs.get(first.id).state=='succeeded'
    assert sdk.call_count==1
    second=jobs.submit('DEMO_TREND',req())
    jobs.execute(second.id)
    cached=jobs.get(second.id)
    assert cached.reused_from==first.id
    assert sdk.call_count==1
    third=jobs.submit('DEMO_TREND',req(force=True))
    jobs.execute(third.id)
    assert sdk.call_count==2


def test_concurrent_same_request_reserves_one_run(jobs):
    jobs,sdk=jobs
    request=req()
    with ThreadPoolExecutor(max_workers=3) as pool:
        runs=list(pool.map(lambda _:jobs.submit('DEMO_TREND',request),range(3)))
    assert len({r.id for r in runs})==1
    with pytest.raises(AiError) as exc:
        jobs.submit('DEMO_RANGE',req())
    assert exc.value.code=='ai_busy'
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(jobs.execute,[runs[0].id,runs[0].id]))
    assert sdk.call_count==1


def test_conflicting_uuid_and_restart_do_not_generate(jobs):
    jobs,sdk=jobs
    request=req()
    run=jobs.submit('DEMO_TREND',request)
    with pytest.raises(AiError) as exc:
        jobs.submit('DEMO_TREND',request.model_copy(update={'language':'pl'}))
    assert exc.value.code=='request_conflict'
    assert jobs.recover_interrupted()==1
    assert jobs.get(run.id).state=='interrupted'
    jobs.execute(run.id)
    assert sdk.call_count==0


def test_outdated_result_and_unknown_delivery_preserve_previous_success(jobs):
    jobs,sdk=jobs
    first=jobs.submit('DEMO_TREND',req())
    jobs.execute(first.id)
    jobs.store.note('DEMO_TREND','New evidence after generation')
    assert jobs.get(first.id).context_changed
    sdk.error=TimeoutError('secret')
    second=jobs.submit('DEMO_TREND',req(force=True))
    jobs.execute(second.id)
    assert jobs.get(second.id).state=='delivery_unknown'
    assert jobs.latest('DEMO_TREND',horizon='2–8 weeks',language='en').id==first.id
    assert sdk.call_count==2


def test_source_change_during_generation_keeps_original_capture(jobs):
    jobs,sdk=jobs
    jobs.store.note('DEMO_TREND','Original captured note')
    original=sdk.create
    def respond(**kwargs):
        assert 'Original captured note' in kwargs['input'][1]['content']
        jobs.store.note('DEMO_TREND','Changed while the model was running')
        return original(**kwargs)
    sdk.create=respond
    run=jobs.submit('DEMO_TREND',req())
    jobs.execute(run.id)
    saved=jobs.store.ai_record(run.id)
    assert saved['state']=='succeeded'
    assert saved['context']['payload']['research']['saved_note']=='Original captured note'
    assert saved['result']['evidence']['research.saved_note']['value']=='Original captured note'
    assert jobs.get(run.id).context_changed
    assert sdk.call_count==1


def test_safe_provider_diagnostics_survive_job_persistence(jobs):
    import httpx
    from openai import OpenAI
    jobs, _ = jobs
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(429, headers={'x-request-id': 'req_persisted', 'x-ratelimit-limit-tokens': '30000'},
            json={'error': {'code': 'rate_limit_exceeded', 'type': 'rate_limit_error',
                           'message': 'private org-name on tokens per min (TPM): Limit 30000, Requested 280000'}})
    with OpenAI(api_key='test-secret', max_retries=0,
                http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        jobs.client = sdk
        run = jobs.submit('DEMO_TREND', req())
        jobs.execute(run.id)
    reloaded = jobs_module()(Store(jobs.store.path), jobs.service, jobs.config)
    failure = reloaded.get(run.id)
    assert failure.state == 'failed'
    assert failure.error['code'] == 'request_too_large'
    assert failure.error['diagnostics']['request_id'] == 'req_persisted'
    assert failure.error['diagnostics']['token_limit'] == 30000
    assert failure.error['diagnostics']['requested_tokens'] == 280000
    assert failure.error['diagnostics']['input_context_bytes'] > 0
    assert 'private' not in str(failure.error)
    assert len(calls) == 1
    assert calls[0].url.path=='/v1/responses/input_tokens'
    assert jobs.store.ai_record(run.id)['api_call_count']==0


def test_token_budget_rejection_persists_without_generation_attempt(jobs,monkeypatch):
    import compass.ai.jobs as module
    jobs,_=jobs
    jobs.client=None
    def oversized(*args,**kwargs):
        raise AiError('context_token_budget_exceeded','No summary was generated.',diagnostics={'input_tokens':190000,'request_token_budget':190000,'requested_tokens':202000})
    def forbidden(*args,**kwargs):
        raise AssertionError('An oversized request must never generate')
    monkeypatch.setattr(module,'check_request_budget',oversized,raising=False)
    monkeypatch.setattr(module,'generate_summary',forbidden)
    run=jobs.submit('DEMO_TREND',req())
    jobs.execute(run.id)
    saved=jobs.store.ai_record(run.id)
    assert saved['state']=='failed'
    assert saved['error']['code']=='context_token_budget_exceeded'
    assert saved['api_call_count']==0
    assert saved['context']['payload']['daily']['instrument']['symbol']=='DEMO_TREND'
