from datetime import datetime, timezone
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from compass.api import create_app


def test_hourly_demo_is_real_interval_and_does_not_change_daily_analysis(tmp_path):
    client = TestClient(create_app(tmp_path / 'demo.sqlite', offline=True))
    before = client.get('/api/analysis/DEMO_TREND').json()
    r = client.get('/api/chart/DEMO_TREND?interval=1h')
    assert r.status_code == 200
    chart = r.json()
    assert chart['interval'] == '1h' and chart['synthetic']
    assert len(chart['bars']) > 200
    assert isinstance(chart['bars'][0]['time'], int)
    assert chart['bars'][18]['ema20'] is None
    assert chart['bars'][19]['ema20'] is not None
    assert chart['engine'].startswith('TA-Lib')
    assert client.get('/api/chart/DEMO_TREND?interval=1h').json()['cache']
    after = client.get('/api/analysis/DEMO_TREND').json()
    assert before['metrics'] == after['metrics']
    assert before['assessment']['label'] == after['assessment']['label']
    assert client.get('/api/chart/DEMO_TREND?interval=5m').status_code == 422


def test_hourly_completion_and_early_close():
    from compass.intraday import normalize_hourly, hourly_grid
    grid = hourly_grid('2026-11-27', '2026-11-27')
    assert len(grid) == 4  # Thanksgiving Friday closes at 13:00 NY.
    assert grid[-1][1] - grid[-1][0] == pd.Timedelta(minutes=30)
    f = pd.DataFrame(dict(Open=100.,High=101.,Low=99.,Close=100.,Volume=1000.),index=[x[0] for x in grid])
    done,q = normalize_hourly(f, now=datetime(2026,11,27,17,45,tzinfo=timezone.utc))
    assert len(done) == 3 and q['provisional_bars'] == 1
    assert not q['stale']  # 11:30–12:30 is published by 12:45 local.
    assert not hourly_grid('2026-11-26','2026-11-26')


def test_hourly_timezone_and_missing_volume():
    from compass.intraday import normalize_hourly, hourly_grid
    a=hourly_grid('2026-03-06','2026-03-06')[0][0]
    b=hourly_grid('2026-03-09','2026-03-09')[0][0]
    assert a.hour == 14 and b.hour == 13  # DST shifts UTC, not session open.
    f=pd.DataFrame(dict(Open=[100.],High=[101.],Low=[99.],Close=[100.],Volume=[None]),index=[b])
    out,q=normalize_hourly(f, now=datetime(2026,3,9,14,55,tzinfo=timezone.utc))
    assert out.Volume.isna().all() and q['issues']
    with pytest.raises(ValueError,match='timezone'):
        normalize_hourly(f.set_axis(pd.DatetimeIndex(['2026-03-09 09:30'])))


def test_synthetic_hourly_aggregates_match_fictional_daily_and_no_lookahead():
    from compass.providers.demo import DemoProvider
    from compass.intraday import normalize_hourly
    from compass.indicators import calculate
    from compass.rules import causal_zones
    provider=DemoProvider()
    daily=provider.fetch('DEMO_TREND').native
    hourly=provider.fetch_hourly('DEMO_TREND').native
    aggregate=hourly.groupby(hourly.index.tz_convert('America/New_York').date).agg({'Open':'first','High':'max','Low':'min','Close':'last','Volume':'sum'})
    for day,row in aggregate.iterrows():
        expected=daily.loc[pd.Timestamp(day)]
        for col in ['Open','High','Low','Close','Volume']:
            assert row[col] == pytest.approx(expected[col],abs=1e-6)
    f,q=normalize_hourly(hourly,synthetic=True)
    full=calculate(f)
    prefix=calculate(f.iloc[:230])
    pd.testing.assert_frame_equal(full.iloc[:230],prefix)
    assert causal_zones(full,229,time_format='%Y-%m-%dT%H:%M:%S%z') == causal_zones(prefix,229,time_format='%Y-%m-%dT%H:%M:%S%z')


def test_missing_corrupt_stale_hourly_bars_are_flagged_without_filling():
    from compass.intraday import normalize_hourly,hourly_grid
    grid=hourly_grid('2026-09-28','2026-09-28')
    f=pd.DataFrame(dict(Open=100.,High=101.,Low=99.,Close=100.,Volume=1000.),index=[x[0] for x in grid])
    f=f.drop(f.index[2])
    f.iloc[3,f.columns.get_loc('High')]=90
    f=pd.concat([f,f.iloc[:1]])
    out,q=normalize_hourly(f,now=datetime(2026,9,29,22,tzinfo=timezone.utc))
    assert len(out)==5 and q['missing_bars'] and q['stale']
    assert any('Duplicate' in x for x in q['issues'])
    assert any('Invalid hourly OHLC' in x for x in q['issues'])


def test_hourly_failure_is_cached_separately_from_daily(tmp_path,monkeypatch):
    from compass.intraday import hourly_chart
    from compass.persistence import Store
    from compass.service import ResearchService
    from compass.providers.demo import DemoProvider
    from compass.providers.yahoo import YahooProvider
    from compass.providers.base import ProviderError
    service=ResearchService(Store(tmp_path/'cache.sqlite'))
    demo=DemoProvider().fetch_hourly('DEMO_TREND')
    demo.instrument.symbol='MU';demo.instrument.synthetic=False
    demo.native['Adj Close']=demo.native.Close
    demo.source=YahooProvider.name
    calls=[]
    def success(self,symbol):
        calls.append(symbol);return demo
    monkeypatch.setattr(YahooProvider,'fetch_hourly',success)
    a=hourly_chart(service,'MU')
    assert not a.cache
    assert hourly_chart(service,'MU').cache and len(calls)==1
    def failure(self,symbol):
        raise ProviderError('Provider rate limited this request.','rate_limited')
    monkeypatch.setattr(YahooProvider,'fetch_hourly',failure)
    failed=hourly_chart(service,'MU',True)
    reopened=hourly_chart(service,'MU')
    assert failed.cache and any('rate limited' in x for x in reopened.quality.issues)
    assert service.store.get('failure:MU') is None
    service.store.set('source:MU','csv')
    with pytest.raises(ProviderError,match='daily candles only'):
        hourly_chart(service,'MU')


def test_hourly_provider_does_not_infer_adjustments_from_adjclose(monkeypatch):
    from compass.providers import yahoo
    f=pd.DataFrame(dict(Open=[100.,99.],High=[101.,100.],Low=[99.,98.],Close=[100.,99.],Volume=[1000.,1000.],Dividends=[0.,1.]),index=pd.date_range('2026-09-28 09:30',periods=2,freq='1h',tz='America/New_York'))
    f['Adj Close']=f.Close  # yfinance may synthesize this when Yahoo omits adjclose.
    info=dict(longName='Test fixture ETF',exchange='PCX',currency='USD',quoteType='ETF')
    monkeypatch.setattr(yahoo,'_download',lambda *args:(info,f,{}))
    bundle=yahoo.YahooProvider().fetch_hourly('SPY')
    assert bundle.basis == 'provider_native'
    pd.testing.assert_frame_equal(bundle.native,f)


def cached_live_hourly(tmp_path, captured_at, *, observed_at=None):
    from compass.intraday import hourly_grid
    from compass.persistence import Store
    from compass.service import ResearchService, encode_frame
    from compass.models import Instrument
    service = ResearchService(Store(tmp_path/'captured.sqlite'), offline=True)
    rows = hourly_grid('2026-09-29','2026-09-29') + hourly_grid('2026-09-30','2026-09-30')[:1]
    native = pd.DataFrame(dict(Open=100., High=101., Low=99., Close=100., Volume=1000.), index=[x[0] for x in rows])
    value = dict(instrument=Instrument(symbol='MU',name='Fixture stock',exchange='NMS',currency='USD',instrument_type='EQUITY',timezone='America/New_York').model_dump(),
                 native=encode_frame(native),basis='provider_native',source='Fixture hourly source',retrieved_at=captured_at.isoformat())
    if observed_at is not None:
        value['observed_at'] = observed_at.isoformat()
    service.store.cache('yfinance:MU:1h:60d:provider_native-v2',value)
    return service


def test_legacy_cached_partial_candle_never_becomes_complete_by_waiting(tmp_path, monkeypatch):
    from compass.intraday import hourly_chart
    from compass.providers.yahoo import YahooProvider
    captured = datetime(2026,9,30,13,41,tzinfo=timezone.utc)
    service = cached_live_hourly(tmp_path,captured)
    def forbidden(*args,**kwargs):
        raise AssertionError('Read-only hourly context must not download')
    monkeypatch.setattr(YahooProvider,'fetch_hourly',forbidden)
    before = hourly_chart(service,'MU',allow_download=False,now=captured)
    later = hourly_chart(service,'MU',allow_download=False,now=datetime(2026,10,1,9,tzinfo=timezone.utc))
    assert before.last_completed_end == later.last_completed_end == '2026-09-29T20:00:00+00:00'
    assert len(before.bars) == len(later.bars) == 7
    assert later.quality.provisional_bars == 1
    assert later.quality.stale
    assert 'Cached hourly candles captured before completion remain excluded until refreshed.' in later.quality.issues


def test_cached_completion_uses_observation_time_and_current_time(tmp_path):
    from compass.intraday import hourly_chart
    observed = datetime(2026,9,30,14,29,tzinfo=timezone.utc)
    service = cached_live_hourly(tmp_path,datetime(2026,9,30,14,31,tzinfo=timezone.utc),observed_at=observed)
    chart = hourly_chart(service,'MU',allow_download=False,now=datetime(2026,10,1,9,tzinfo=timezone.utc))
    assert chart.last_completed_end == '2026-09-29T20:00:00+00:00'
    assert len(chart.bars) == 7
    # A future observation timestamp cannot bypass the present completion boundary.
    service = cached_live_hourly(tmp_path,datetime(2026,10,1,9,tzinfo=timezone.utc),observed_at=datetime(2026,10,1,9,tzinfo=timezone.utc))
    before_close = hourly_chart(service,'MU',allow_download=False,now=observed)
    assert before_close.last_completed_end == '2026-09-29T20:00:00+00:00'


def test_refresh_records_download_start_and_excludes_a_candle_that_closes_in_flight(tmp_path,monkeypatch):
    import compass.intraday as module
    from compass.providers.base import Bundle
    from compass.providers.yahoo import YahooProvider
    started = datetime(2026,9,30,14,29,tzinfo=timezone.utc)
    finished = datetime(2026,9,30,14,31,tzinfo=timezone.utc)
    service = cached_live_hourly(tmp_path,started)
    service.offline = False
    original = service.store.cached('yfinance:MU:1h:60d:provider_native-v2')
    from compass.service import decode_frame
    from compass.models import Instrument
    clock = [started]
    monkeypatch.setattr(module,'utcnow',lambda:clock[0])
    def fetch(self,symbol):
        clock[0] = finished
        return Bundle(Instrument(**original['instrument']),decode_frame(original['native']),'provider_native','Fixture hourly source',{})
    monkeypatch.setattr(YahooProvider,'fetch_hourly',fetch)
    chart = module.hourly_chart(service,'MU',refresh=True)
    stored = service.store.cached('yfinance:MU:1h:60d:provider_native-v2')
    assert stored['observed_at'] == started.isoformat()
    assert stored['retrieved_at'] == finished.isoformat()
    assert chart.last_completed_end == '2026-09-29T20:00:00+00:00'
    assert chart.quality.provisional_bars == 1
