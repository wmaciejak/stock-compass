import pytest
from fastapi.testclient import TestClient
from compass.api import create_app


@pytest.mark.parametrize('horizon', ['1–2 weeks', '2–8 weeks', '1–6 months', '6–12 months'])
def test_research_horizons_persist_and_preserve_daily_calculations(tmp_path, horizon):
    path = tmp_path / 'research.sqlite'
    client = TestClient(create_app(path, offline=True))
    base = client.get('/api/analysis/DEMO_TREND').json()
    settings = client.get('/api/settings').json()
    settings['horizon'] = horizon
    saved = client.put('/api/settings', json=settings)
    assert saved.status_code == 200
    reopened = TestClient(create_app(path, offline=True))
    assert reopened.get('/api/settings').json()['horizon'] == horizon
    a = reopened.get('/api/analysis/DEMO_TREND').json()
    assert a['assessment']['horizon'] == horizon
    assert 'daily' in a['assessment']['horizon_scope']
    assert a['metrics'] == base['metrics']
    assert a['assessment']['strategy_signals'] == base['assessment']['strategy_signals']
    if horizon in ['1–6 months', '6–12 months'] and a['weekly']['trend'] != 'Bullish':
        assert a['assessment']['label'] != 'Buy setup worth considering'
    report = reopened.get('/api/export/DEMO_TREND').text
    assert a['assessment']['horizon_scope'] in report
    settings['horizon'] = 'intraday'
    assert client.put('/api/settings', json=settings).status_code == 422
