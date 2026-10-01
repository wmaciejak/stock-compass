import pytest
from fastapi.testclient import TestClient
from compass.api import create_app


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path / 'plan.sqlite', offline=True))


def inputs(**changes):
    return {**dict(goal_name='', target_amount=None, initial_amount=1000,
                   monthly_contribution=100, years=2, currency='PLN',
                   annual_return=0, annual_fee=0), **changes}


def test_zero_return_end_of_month_contributions(client):
    response = client.post('/api/planning/scenario', json=inputs())
    assert response.status_code == 200
    result = response.json()
    assert result['total_contributed'] == 3400
    assert result['ending_value'] == 3400
    assert result['fee_impact'] == 0
    assert [point['year'] for point in result['series']] == [0, 1, 2]


@pytest.mark.parametrize('annual_return', [12, -25])
def test_effective_return_matches_independent_annuity_formula(client, annual_return):
    result = client.post('/api/planning/scenario', json=inputs(annual_return=annual_return)).json()
    q = (1 + annual_return / 100) ** (1 / 12)
    expected = 1000 * (1 + annual_return / 100) ** 2 + 100 * ((1 + annual_return / 100) ** 2 - 1) / (q - 1)
    assert result['ending_value'] == pytest.approx(expected, rel=1e-12)
    assert result['fee_impact'] == 0
    assert result['growth'] == pytest.approx(expected - 3400)


def test_fees_target_gap_and_unrounded_annual_series(client):
    result = client.post('/api/planning/scenario', json=inputs(monthly_contribution=0, annual_return=10, annual_fee=2, target_amount=2000)).json()
    assert result['ending_value'] == pytest.approx(1000 * 1.078 ** 2)
    assert result['fee_impact'] == pytest.approx(1210 - 1000 * 1.078 ** 2)
    assert result['goal_gap'] == pytest.approx(2000 - 1000 * 1.078 ** 2)
    assert result['series'][1]['after_fees'] == pytest.approx(1078)
    assert result['series'][0] == {'year': 0, 'contributed': 1000, 'before_fees': 1000, 'after_fees': 1000}
    assert result['inputs']['currency'] == 'PLN'
    assert result['assumptions']


@pytest.mark.parametrize('field,value', [('initial_amount',-1),('initial_amount',1e9+1),('monthly_contribution',1e7+1),('years',0),('years',51),('years',1.5),('annual_return',-51),('annual_return',51),('annual_fee',-1),('annual_fee',11),('target_amount',0),('target_amount',1e12+1),('currency','JPY'),('goal_name','x'*101)])
def test_rejects_invalid_fields_without_overwriting_saved_plan(client, field, value):
    assert client.put('/api/planning/plan', json=inputs()).status_code == 200
    assert client.post('/api/planning/scenario', json=inputs(**{field:value})).status_code == 422
    assert client.put('/api/planning/plan', json=inputs(**{field:value})).status_code == 422
    assert client.get('/api/planning/plan').json() == inputs()


@pytest.mark.parametrize('field', ['initial_amount','monthly_contribution','annual_return','annual_fee','target_amount','years'])
@pytest.mark.parametrize('value', ['NaN','Infinity','-Infinity'])
def test_rejects_nonfinite_numeric_input(client, field, value):
    assert client.post('/api/planning/scenario', json=inputs(**{field:value})).status_code == 422


def test_requires_inputs_and_positive_savings(client):
    assert client.post('/api/planning/scenario', json={}).status_code == 422
    assert client.post('/api/planning/scenario', json=inputs(initial_amount=0, monthly_contribution=0)).status_code == 422


def test_plan_persists_across_restart_and_unsaved_is_null(tmp_path):
    path = tmp_path / 'persist.sqlite'
    first = TestClient(create_app(path, offline=True))
    assert first.get('/api/planning/plan').json() is None
    assert first.put('/api/planning/plan', json=inputs(goal_name='Home')).status_code == 200
    assert TestClient(create_app(path, offline=True)).get('/api/planning/plan').json() == inputs(goal_name='Home')


def test_new_mutations_keep_local_origin_restriction(client):
    assert client.put('/api/planning/plan', json=inputs(), headers={'Origin':'https://other.example'}).status_code == 403


@pytest.mark.parametrize('value', ['NaN','Infinity','-Infinity'])
def test_nonstandard_json_numeric_constants_are_rejected(client, value):
    import json
    body = json.dumps(inputs()).replace('"annual_return": 0', '"annual_return": ' + value)
    response = client.post('/api/planning/scenario', content=body, headers={'Content-Type':'application/json'})
    assert response.status_code == 422


def test_boundary_values_are_supported(client):
    response = client.post('/api/planning/scenario', json=inputs(goal_name='x'*100, initial_amount=1e9, monthly_contribution=1e7, years=50, annual_return=50, annual_fee=10, target_amount=1e12, currency='GBP'))
    assert response.status_code == 200
    assert len(response.json()['series']) == 51


def test_optional_goal_and_target_can_be_omitted(client):
    body = inputs()
    body.pop('goal_name')
    body.pop('target_amount')
    response = client.post('/api/planning/scenario', json=body)
    assert response.status_code == 200
    assert response.json()['inputs']['goal_name'] == ''
    assert response.json()['inputs']['target_amount'] is None
    assert response.json()['goal_gap'] is None
    assert client.put('/api/planning/plan', json=body).status_code == 200
    assert client.get('/api/planning/plan').json() == inputs()
