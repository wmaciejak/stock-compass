from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from compass.api import create_app

NOW = datetime(2026, 9, 30, 18, tzinfo=timezone.utc)


def stamp(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp()


def instrument(**changes):
    return {'symbol':'TEST','name':'Test Company','exchange':'NMS','currency':'USD','instrument_type':'EQUITY','timezone':'America/New_York','synthetic':False, **changes}


def row(data=None, retrieved_at=None, **changes):
    from compass.events import earnings_row
    return earnings_row(instrument(**changes), {'status':'available','data':data,'retrieved_at':retrieved_at or NOW.isoformat()}, source='yfinance', now=NOW)


def test_same_day_exchange_timezone_and_source_timestamp():
    result = row({'earningsTimestamp':stamp('2026-10-01T01:00:00')})
    assert result.status == 'estimated'
    assert result.date_start == result.date_end == '2026-09-30'
    assert result.in_window
    assert result.date_basis == 'exchange_local'
    assert result.retrieved_at == NOW.isoformat()
    assert result.exchange_timezone == 'America/New_York'


def test_past_exact_does_not_mask_future_range_and_outside_window_remains_known():
    result = row({'earningsTimestamp':stamp('2026-09-01T18:00:00'),'earningsTimestampStart':stamp('2026-11-01T18:00:00'),'earningsTimestampEnd':stamp('2026-11-03T18:00:00')})
    assert result.status == 'estimated'
    assert (result.date_start, result.date_end) == ('2026-11-01','2026-11-03')
    assert not result.in_window


@pytest.mark.parametrize('data,reason', [({'date':'2026-10-01','estimated':True},'legacy_date_unverified'), ({'earningsTimestamp':0},'past_event'), ({'earningsTimestamp':'bad'},'invalid_timestamps'), ({'earningsTimestamp':1e30},'invalid_timestamps'), ({'earningsTimestampStart':stamp('2026-10-03T18:00:00'),'earningsTimestampEnd':stamp('2026-10-01T18:00:00')},'invalid_range'), ({},'earnings_unknown')])
def test_unknown_and_unverified_observations_remain_visible(data, reason):
    result = row(data)
    assert result.status == 'unknown'
    assert result.reason_code == reason
    assert not result.in_window
    if 'date' in data:
        assert result.last_reported_date == '2026-10-01'
        assert result.date_start is None


@pytest.mark.parametrize('retrieved,freshness', [(NOW,'fresh'),(NOW-timedelta(hours=24),'fresh'),(NOW-timedelta(hours=24,seconds=1),'stale'),(NOW+timedelta(seconds=1),'unknown'),('bad','unknown')])
def test_original_metadata_freshness(retrieved, freshness):
    value = retrieved.isoformat() if isinstance(retrieved, datetime) else retrieved
    assert row({'earningsTimestamp':stamp('2026-10-01T18:00:00')}, retrieved_at=value).freshness == freshness


def test_unknown_missing_retrieval_invalid_timezone_and_not_applicable():
    from compass.events import earnings_row
    assert earnings_row(instrument(), {'data':{'earningsTimestamp':stamp('2026-10-01T18:00:00')}}, now=NOW).freshness == 'unknown'
    assert row({'earningsTimestamp':stamp('2026-10-01T18:00:00')}, timezone='invalid/zone').reason_code == 'exchange_timezone_unknown'
    assert row({}, instrument_type='ETF').status == 'not_applicable'
    assert row({}, synthetic=True).reason_code == 'synthetic'
    assert earnings_row(instrument(), {}, source='csv', now=NOW).reason_code == 'csv_identity_unverified'


def test_calendar_is_cache_only_mode_separated_and_preserves_failure(tmp_path, monkeypatch):
    client = TestClient(create_app(tmp_path / 'calendar.sqlite', offline=True))
    service, store = client.app.state.service, client.app.state.store
    for symbol in store.watchlist():
        store.remove_watch(symbol)
    store.add_watch('TEST'); store.add_watch('MISSING'); store.add_watch('DEMO_TREND')
    store.cache(service.key('TEST'), {'instrument':instrument(), 'context':{'earnings':{'status':'available','data':{'earningsTimestamp':stamp('2026-10-01T18:00:00')},'retrieved_at':NOW.isoformat()}}, 'retrieved_at':NOW.isoformat()})
    failure = {'at':NOW.isoformat(),'message':'Refresh failed','code':'offline'}
    store.set('failure:TEST', failure)
    monkeypatch.setattr('compass.events.utcnow', lambda:NOW)
    monkeypatch.setattr(service, 'load', lambda *a,**k: (_ for _ in ()).throw(AssertionError('Calendar must not load prices')))
    from compass.providers.yahoo import YahooProvider
    monkeypatch.setattr(YahooProvider, 'fetch', lambda *a,**k: (_ for _ in ()).throw(AssertionError('Calendar must not fetch')))
    response = client.get('/api/watchlist/events?mode=live&window_days=30')
    assert response.status_code == 200
    result = response.json()
    assert result['offline'] and result['freshness_hours'] == 24
    assert [r['symbol'] for r in result['rows']] == ['TEST','MISSING']
    assert result['rows'][0]['refresh_error'] == failure
    assert result['rows'][0]['status'] == 'estimated'
    assert result['rows'][1]['reason_code'] == 'no_cache'
    assert client.get('/api/watchlist/events?mode=demo').json()['rows'][0]['status'] == 'not_applicable'
    assert client.get('/api/watchlist/events?mode=invalid').status_code == 422
    assert client.get('/api/watchlist/events?window_days=60').status_code == 422


def test_provider_preserves_raw_range_and_handles_malformed_metadata(monkeypatch):
    from compass.events import provider_earnings
    monkeypatch.setattr('compass.events.utcnow', lambda:NOW)
    evidence = {'earningsTimestamp':stamp('2026-09-01T18:00:00'),'earningsTimestampStart':stamp('2026-10-03T18:00:00'),'earningsTimestampEnd':stamp('2026-10-05T18:00:00')}
    result = provider_earnings(evidence, 'America/New_York', NOW.isoformat())
    assert result['data']['date'] == '2026-10-03'
    assert result['data']['date_end'] == '2026-10-05'
    for key, value in evidence.items():
        assert result['data'][key] == value
    assert provider_earnings({'earningsTimestamp':float('nan')}, 'America/New_York', NOW.isoformat())['status'] == 'unavailable'


def test_analysis_and_watch_share_unverified_legacy_event(tmp_path):
    client = TestClient(create_app(tmp_path / 'shared.sqlite', offline=True))
    service, store = client.app.state.service, client.app.state.store
    client.get('/api/analysis/DEMO_TREND')
    cached = store.cached(service.key('DEMO_TREND'))
    cached['instrument'].update(instrument(symbol='TEST'))
    import pandas as pd
    from io import StringIO
    frame = pd.read_json(StringIO(cached['native']), orient='split')
    frame['Adj Close'] = frame.Close
    cached['native'] = frame.to_json(orient='split', date_format='iso')
    cached['context']['earnings'] = {'status':'available','data':{'date':'2026-10-01','estimated':True},'retrieved_at':NOW.isoformat()}
    store.cache(service.key('TEST'), cached)
    store.add_watch('TEST')
    response = client.get('/api/analysis/TEST')
    assert response.status_code == 200, response.text
    analysis = response.json()
    watch = next(r for r in client.get('/api/watchlist?mode=live').json() if r['symbol']=='TEST')
    calendar = next(r for r in client.get('/api/watchlist/events?mode=live').json()['rows'] if r['symbol']=='TEST')
    assert analysis['earnings'] == watch['earnings'] == calendar
    assert analysis['earnings']['reason_code'] == 'legacy_date_unverified'
    assert 'Provider-estimated' not in analysis['assessment']['event_risk']
    from compass.models import Analysis
    legacy = dict(analysis)
    legacy.pop('beginner'); legacy.pop('earnings')
    assert Analysis(**legacy).beginner is None


@pytest.mark.parametrize('synthetic,status,reason', [
    (True, 'not_applicable', 'synthetic'),
    (False, 'unknown', 'csv_identity_unverified'),
])
def test_csv_earnings_respects_explicit_synthetic_identity(synthetic, status, reason):
    from compass.events import earnings_row
    result = earnings_row(instrument(synthetic=synthetic), {}, source='csv', now=NOW)
    assert result.status == status
    assert result.reason_code == reason
    assert result.date_start is None and result.date_end is None
    assert not result.in_window


def test_imported_synthetic_csv_calendar_is_not_applicable_without_loading_prices(tmp_path, monkeypatch):
    from pathlib import Path
    client = TestClient(create_app(tmp_path / 'synthetic-csv.sqlite', offline=True))
    service, store = client.app.state.service, client.app.state.store
    for symbol in store.watchlist():
        store.remove_watch(symbol)
    csv = (Path(__file__).resolve().parents[2] / 'fixtures/DEMO_RANGE.csv').read_text()
    for symbol in ('DEMO_IMPORTED', 'CSVIMPORT'):
        response = client.post('/api/csv/import', json=dict(symbol=symbol, name='CSV example',
            exchange='NYSE', currency='USD', price_basis='unknown', csv=csv))
        assert response.status_code == 200, response.text
        assert service.source(symbol) == 'csv'

    def forbidden(*args, **kwargs):
        raise AssertionError('Calendar must read imported metadata without price loads or provider calls')

    monkeypatch.setattr(service, 'load', forbidden)
    monkeypatch.setattr('compass.providers.yahoo.YahooProvider.fetch', forbidden)
    monkeypatch.setattr('compass.providers.demo.DemoProvider.fetch', forbidden)
    synthetic = client.get('/api/watchlist/events?mode=demo').json()['rows']
    real = client.get('/api/watchlist/events?mode=live').json()['rows']
    assert len(synthetic) == len(real) == 1
    assert (synthetic[0]['symbol'], synthetic[0]['status'], synthetic[0]['reason_code']) == (
        'DEMO_IMPORTED', 'not_applicable', 'synthetic')
    assert (real[0]['symbol'], real[0]['status'], real[0]['reason_code']) == (
        'CSVIMPORT', 'unknown', 'csv_identity_unverified')
