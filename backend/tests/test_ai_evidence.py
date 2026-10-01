from uuid import uuid4
from compass.persistence import Store
from compass.service import ResearchService
from compass.ai.config import load_ai_config
from compass.ai.models import AiSummaryRequest
from compass.ai.context import build_context
from compass.ai.client import validate_summary
from compass.ai.models import AiError, AiLevel
from ai_helpers import make_summary_content
import pytest
from compass.normalization import utcnow


def test_saved_snapshots_have_citable_evidence(tmp_path):
    store=Store(tmp_path/'snapshot.sqlite')
    service=ResearchService(store)
    analysis=service.analysis('DEMO_TREND')
    store.save_snapshot('DEMO_TREND',analysis.model_dump(mode='json'))
    request=AiSummaryRequest(client_request_id=uuid4(),horizon='2–8 weeks',language='en',mode='demo')
    context=build_context(store.read_ai_snapshot('DEMO_TREND',[]),request,load_ai_config(offline=False),now=utcnow())
    source=context.evidence.get('research.snapshots.0.analysis.metrics.Close')
    assert source is not None
    assert source.value==analysis.metrics['Close']
    assert source.price_basis=='split_dividend_adjusted'


def test_non_price_numbers_cannot_be_support_levels(tmp_path):
    store=Store(tmp_path/'levels.sqlite')
    service=ResearchService(store)
    service.analysis('DEMO_TREND')
    request=AiSummaryRequest(client_request_id=uuid4(),horizon='2–8 weeks',language='en',mode='demo')
    context=build_context(store.read_ai_snapshot('DEMO_TREND',[]),request,load_ai_config(offline=False),now=utcnow())
    source=context.evidence['daily.metrics.rsi14']
    content=make_summary_content()
    content.scenarios[0].levels=[AiLevel(label='Support',role='support',value=source.value,
        source_ref='daily.metrics.rsi14',interval='1d',price_basis='split_dividend_adjusted')]
    with pytest.raises(AiError):
        validate_summary(content,context,request)


def test_quote_basis_and_expiration_are_preserved_without_download(tmp_path):
    from datetime import datetime, timezone, timedelta
    from compass.providers.yahoo import current_session_quote
    store=Store(tmp_path/'quote.sqlite')
    service=ResearchService(store)
    service.analysis('DEMO_TREND')
    now=datetime(2026,9,30,15,0,tzinfo=timezone.utc)
    cached=store.cached(service.key('DEMO_TREND'))
    cached['context']['quote']=current_session_quote(dict(regularMarketPrice=105,
        regularMarketPreviousClose=100,regularMarketTime=int(now.timestamp())),now=now)
    store.cache(service.key('DEMO_TREND'),cached)
    request=AiSummaryRequest(client_request_id=uuid4(),horizon='2–8 weeks',language='en',mode='demo')
    snapshot=store.read_ai_snapshot('DEMO_TREND',[])
    context=build_context(snapshot,request,load_ai_config(offline=False),now=now)
    source=context.evidence['daily.context.quote.data.price']
    assert source.price_basis=='provider_native'
    assert source.interval is None  # An instantaneous quote is not a completed 1d/1h level.
    expired=build_context(snapshot,request,load_ai_config(offline=False),now=now+timedelta(minutes=31))
    assert expired.payload['daily']['context']['quote']['status']=='unavailable'
    assert context.fingerprint!=expired.fingerprint


def test_daily_quality_can_expire_without_downloading(tmp_path):
    from datetime import datetime, timezone, timedelta
    store=Store(tmp_path/'stale.sqlite')
    service=ResearchService(store)
    service.analysis('DEMO_TREND')
    value=store.cached(service.key('DEMO_TREND'))
    symbol='ZZAIQUALITY'
    value['instrument'].update(symbol=symbol,synthetic=False,name='Controlled real-data fixture')
    store.set('source:'+symbol,'csv')
    store.set('settings',{'mode':'live','benchmark':symbol})
    store.add_watch(symbol)
    store.cache(service.key(symbol),value)
    request=AiSummaryRequest(client_request_id=uuid4(),horizon='2–8 weeks',language='en',mode='live')
    snapshot=store.read_ai_snapshot(symbol,[])
    now=datetime(2026,9,30,15,0,tzinfo=timezone.utc)
    context=build_context(snapshot,request,load_ai_config(offline=False),now=now)
    assert context.daily_actionable
    stale=build_context(snapshot,request,load_ai_config(offline=False),now=now+timedelta(days=7))
    assert not stale.daily_actionable
    assert stale.payload['daily']['assessment']['data_quality']['stale']
    assert stale.fingerprint!=context.fingerprint
