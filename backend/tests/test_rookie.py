import pytest
from fastapi.testclient import TestClient
from compass.api import create_app


def test_new_settings_and_explicit_legacy_migration(tmp_path):
    client = TestClient(create_app(tmp_path / 'rookie.sqlite', offline=True))
    assert client.get('/api/settings').json()['experience'] == 'beginner'
    assert client.get('/api/settings').json()['preferred_workspace'] == 'research'
    client.app.state.store.set('settings', {'mode':'live'})
    assert client.get('/api/settings').json()['experience'] == 'advanced'
    assert client.put('/api/settings', json={'experience':'beginner','preferred_workspace':'long_term'}).status_code == 200
    assert client.get('/api/settings').json()['preferred_workspace'] == 'long_term'


def test_onboarding_persistence_and_validation(tmp_path):
    path = tmp_path / 'guide.sqlite'
    client = TestClient(create_app(path, offline=True))
    assert client.get('/api/onboarding').json() == {'version':1,'path':'research','step':0,'state':'active'}
    progress = {'version':1,'path':'long_term','step':2,'state':'dismissed'}
    assert client.put('/api/onboarding', json=progress).status_code == 200
    assert TestClient(create_app(path, offline=True)).get('/api/onboarding').json() == progress
    for change in [{'step':4},{'path':'other'},{'version':2},{'state':'skipped'}]:
        assert client.put('/api/onboarding', json={**progress, **change}).status_code == 422
    assert client.get('/api/onboarding').json() == progress


def test_blocked_analysis_leads_with_repair_and_no_buy_suggestion(tmp_path):
    client = TestClient(create_app(tmp_path / 'blocked.sqlite', offline=True))
    a = client.get('/api/analysis/DEMO_TREND').json()
    assert a['beginner'] is not None
    from compass.models import Analysis
    from compass.beginner import beginner_summary
    model = Analysis(**a)
    model.assessment.data_quality.actionable = False
    model.assessment.data_quality.stale = True
    model.assessment.data_quality.issues = ['Prices are stale']
    model.assessment.label = 'Buy setup worth considering'
    model.assessment.next_condition = 'Buy the breakout'
    summary = beginner_summary(model)
    assert summary.caution_kind == 'data'
    assert summary.conclusion == 'Insufficient or stale data'
    assert 'buy' not in (summary.explanation + summary.next_condition).lower()
    assert 'stale' in summary.caution.lower()
    assert summary.supporting == []


def test_beginner_priority_and_synthetic_no_company_risk(tmp_path):
    client = TestClient(create_app(tmp_path / 'priority.sqlite', offline=True))
    from compass.models import Analysis
    from compass.beginner import beginner_summary
    a = Analysis(**client.get('/api/analysis/DEMO_TREND').json())
    a.assessment.data_quality.actionable = True
    a.assessment.data_quality.stale = False
    a.assessment.opposing = ['Trend evidence disagrees']
    assert beginner_summary(a).caution_kind == 'opposing'
    a.assessment.opposing = []
    assert beginner_summary(a).caution_kind == 'uncertainty'
    a.instrument.synthetic = False
    a.earnings = None
    assert beginner_summary(a).caution_kind == 'event_unknown'
    from compass.models import EarningsRow
    a.earnings = EarningsRow(symbol='TEST', name='Test', status='estimated', date_start='2026-10-10', date_end='2026-10-10')
    assert beginner_summary(a).caution_kind == 'earnings'
    a.assessment.opposing = ['x','y','z','q']
    a.assessment.supporting = ['a','b','c','d']
    assert beginner_summary(a).supporting == ['a','b','c']
