from dataclasses import replace
from uuid import uuid4
from fastapi.testclient import TestClient
from compass.api import create_app
from compass.ai.config import load_ai_config
from ai_helpers import RecordingClient


def test_ai_routes_available_but_disabled_without_configuration(tmp_path):
    client=TestClient(create_app(tmp_path/'api.sqlite',offline=True))
    status=client.get('/api/ai/status')
    assert status.status_code==200
    assert not status.json()['enabled']
    body=dict(client_request_id=str(uuid4()),horizon='2–8 weeks',language='en',mode='demo')
    assert client.post('/api/ai/summaries/DEMO_TREND',json=body).status_code==503
    assert client.get('/api/ai/summaries/DEMO_TREND').json() is None


def test_api_generation_replay_origin_and_gets(tmp_path):
    # Fail on the absent public route before calling the new injection interface.
    probe=TestClient(create_app(tmp_path/'probe.sqlite',offline=True))
    assert probe.get('/api/ai/status').status_code==200
    sdk=RecordingClient()
    config=replace(load_ai_config(offline=False),enabled=True,disabled_reason=None,api_key='fake-secret')
    client=TestClient(create_app(tmp_path/'api.sqlite',offline=False,ai_config=config,ai_client=sdk))
    body=dict(client_request_id=str(uuid4()),horizon='2–8 weeks',language='en',mode='demo')
    assert client.post('/api/ai/summaries/DEMO_TREND',json=body,headers={'Origin':'https://foreign.invalid'}).status_code==403
    first=client.post('/api/ai/summaries/DEMO_TREND',json=body)
    assert first.status_code==202
    replay=client.post('/api/ai/summaries/DEMO_TREND',json=body)
    assert replay.json()['id']==first.json()['id']
    result=client.get('/api/ai/runs/'+first.json()['id'])
    assert result.json()['state']=='succeeded'
    assert result.json()['result']['model']=='gpt-6.1-sol'
    assert client.get('/api/ai/summaries/DEMO_TREND').json()['id']==first.json()['id']
    assert sdk.call_count==1
    assert 'fake-secret' not in result.text
    assert client.get('/api/ai/runs/missing').status_code==404
    assert client.post('/api/ai/summaries/DEMO_TREND',json={**body,'model':'override'}).status_code==422


def test_lost_acknowledgement_recovers_original_uuid_after_drafts_change(tmp_path):
    sdk=RecordingClient(error=TimeoutError('lost acknowledgement'))
    config=replace(load_ai_config(offline=False),enabled=True,disabled_reason=None,api_key='fake-key')
    client=TestClient(create_app(tmp_path/'recovery.sqlite',offline=False,ai_config=config,ai_client=sdk))
    body=dict(client_request_id=str(uuid4()),horizon='2–8 weeks',language='en',mode='demo',
              force=True,browser_context={'note_draft':'Draft before browser reload'})
    submitted=client.post('/api/ai/summaries/DEMO_TREND',json=body)
    recovered=client.get('/api/ai/requests/'+body['client_request_id'])
    assert recovered.status_code==200
    assert recovered.json()['id']==submitted.json()['id']
    assert recovered.json()['state']=='delivery_unknown'
    assert client.get('/api/ai/requests/'+str(uuid4())).status_code==404
    assert sdk.call_count==1
