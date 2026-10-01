from copy import deepcopy
from datetime import datetime, timedelta
import hashlib
from compass.service import ResearchService, symbol_name
from compass.intraday import hourly_chart
from compass.analysis import compare_analyses
from compass.providers.base import ProviderError, unavailable
from compass.providers.yahoo import fetch_news, current_session_quote
from compass.sizing import size_position
from compass.rules import VERSION
from .snapshot import ResearchSnapshot
from .models import AiContext, AiError, ContextSection, EvidenceSource
from .serialization import canonical, encode_rows, decode_rows, serialize_context, ENCODING_VERSION, HISTORICAL_INDICATOR_DECIMALS, HISTORICAL_INDICATOR_WINDOW_BARS

PROMPT_VERSION = 'stock-compass-ai-v4'
SCHEMA_VERSION = 'stock-compass-ai-schema-v2'


def context_json(context):
    return serialize_context(context)


def prepare_context(service, request, symbol):
    symbol = symbol_name(symbol)
    if service.offline:
        raise AiError('ai_offline','AI is unavailable in offline mode.')
    try:
        service.analysis(symbol)
    except (ProviderError,ValueError) as e:
        raise AiError('context_unavailable','Load usable daily market data before generating an AI summary.') from e
    try:
        hourly_chart(service,symbol)
    except (ProviderError,ValueError):
        pass
    value = service.store.cached(service.key(symbol))
    if service.source(symbol)=='yfinance' and value and not value.get('context',{}).get('news',{}).get('retrieved_at'):
        value['context']['news'] = fetch_news(symbol)
        service.store.cache(service.key(symbol),value)


def _semantic(value):
    if isinstance(value,dict):
        return {k:_semantic(v) for k,v in value.items() if k not in ('timestamp','captured_at','cache')}
    if isinstance(value,list):
        return [_semantic(v) for v in value]
    return value


def _price_field(path):
    """Only native price observations/technical price fields qualify as levels."""
    parts = path.split('.')
    field = parts[-1]
    return (
        (parts[-2] == 'metrics' and field in {'Open','High','Low','Close','sma20','sma50','sma200','ema20','high20','low20'})
        or (len(parts) >= 3 and parts[-3] == 'zones' and field in {'low','high'})
        or (parts[-2] == 'scenario' and field in {'entry','entry_max','stop','target'})
        or (parts[-2] == 'weekly' and field in {'close','sma20','sma50'})
        or ('.context.quote.data.' in path and field in {'price','previous_close'})
    )


def _sources(value, prefix, evidence, *, interval=None, basis=None):
    if isinstance(value,dict):
        for key,item in value.items():
            if key not in ('bars','series','equity','trades','snapshots'):
                if key == 'quote' and prefix.endswith('.context') and isinstance(item,dict):
                    _sources(item,f'{prefix}.{key}',evidence,interval=None,basis=(item.get('data') or {}).get('price_basis'))
                else:
                    _sources(item,f'{prefix}.{key}',evidence,interval=interval,basis=basis)
    elif isinstance(value,list):
        for index,item in enumerate(value):
            _sources(item,f'{prefix}.{index}',evidence,interval=interval,basis=basis)
    elif value is not None:
        price = _price_field(prefix) and isinstance(value,(int,float)) and not isinstance(value,bool) and basis is not None
        price_interval = '1w' if '.weekly.' in prefix else interval
        evidence[prefix]=EvidenceSource(label=prefix,category=prefix.split('.')[0],path=prefix,value=value,
            kind='price' if price else 'fact',interval=price_interval if price else None,price_basis=basis if price else None)


def build_context(snapshot, request, config, *, now, symbol=None):
    snapshot = ResearchSnapshot.from_records(snapshot.records if isinstance(snapshot,ResearchSnapshot) else snapshot)
    symbol = symbol_name(symbol or snapshot.records['symbol'])
    settings = snapshot.get('settings', {})
    settings.update(horizon=request.horizon, language=request.language, mode=request.mode)
    snapshot.records['kv']['settings']=settings
    service = ResearchService(snapshot, offline=True)
    try:
        analysis = service.analysis(symbol,allow_download=False,now=now).model_dump(mode='json')
    except (ProviderError,ValueError) as e:
        raise AiError('context_unavailable','Usable daily context is unavailable.') from e
    quote=analysis['context'].get('quote',{})
    if quote.get('status')=='available':
        q=quote.get('data',{})
        checked=current_session_quote(dict(regularMarketPrice=q.get('price'),regularMarketPreviousClose=q.get('previous_close'),regularMarketTime=datetime.fromisoformat(q['market_time']).timestamp()),now=now)
        if checked['status']!='available' or q.get('session','') <= (analysis['provenance']['last_completed_bar'] or ''):
            analysis['context']['quote']=unavailable('Quote is expired or is not newer than the completed daily bar.')
    benchmark_symbol=analysis['benchmark']
    try:
        benchmark=service.analysis(benchmark_symbol,allow_download=False,now=now).model_dump(mode='json')
    except (ProviderError,ValueError):
        benchmark=unavailable('Benchmark data are unavailable.')
    try:
        hourly=hourly_chart(service,symbol,allow_download=False,now=now).model_dump(mode='json')
    except (ProviderError,ValueError) as e:
        hourly=unavailable(str(e))
    backtests={}
    for kind in ('crossover','breakout'):
        result=snapshot.get(f'backtest:{symbol}:{kind}')
        backtests[kind]=dict(status='available',result=result,config=snapshot.get(f'backtest_config:{symbol}:{kind}'),
                             stale_result=(result.get('provenance',{}).get('retrieved_at')!=analysis['provenance']['retrieved_at'] or result.get('rule_version')!=VERSION)) if result else unavailable('This strategy has not been run.')
    browser=request.browser_context.model_dump(mode='json')
    sizing=unavailable('No calculated sizing input snapshot is available.')
    if request.browser_context.sizing_input:
        try:
            sizing=dict(status='available',data=size_position(**request.browser_context.sizing_input.model_dump()))
        except ValueError as e:
            sizing=unavailable(str(e))
    comparison=unavailable('No comparison involving this ticker was selected.')
    peers=list(dict.fromkeys(symbol_name(s) for s in browser['comparison_symbols']))
    if symbol in peers and 2 <= len(peers) <=4:
        try:
            comparison=dict(status='available',data=compare_analyses([service.analysis(s,allow_download=False,now=now) for s in peers]))
            comparison['data']['analyses']=[a.model_dump(mode='json') for a in comparison['data']['analyses']]
        except (ValueError,ProviderError) as e:
            comparison=unavailable(str(e))
    payload=dict(request=dict(symbol=symbol,horizon=request.horizon,language=request.language,mode=request.mode,captured_at=now.isoformat(),prompt_version=PROMPT_VERSION,schema_version=SCHEMA_VERSION,
                              context_encoding=ENCODING_VERSION,historical_indicator_decimals=HISTORICAL_INDICATOR_DECIMALS,
                              historical_indicator_window_bars=HISTORICAL_INDICATOR_WINDOW_BARS),
                 daily=analysis,benchmark=benchmark,hourly=hourly,backtests=backtests,browser=browser,
                 research=dict(saved_note=snapshot.note(symbol),effective_note=browser['note_draft'] if browser['note_draft'] is not None else snapshot.note(symbol),journal=snapshot.journal(),snapshots=snapshot.records['snapshots'],sizing_result=sizing),
                 workspace=dict(settings=settings,watchlist=[service.summary(s) for s in snapshot.watchlist() if s.startswith('DEMO_')==(request.mode=='demo')],comparison=comparison))
    evidence={}
    _sources(analysis,'daily',evidence,interval='1d',basis=analysis['provenance']['price_basis'])
    _sources(hourly,'hourly',evidence,interval='1h',basis=hourly.get('price_basis'))
    for key in ('benchmark','backtests','browser','research','workspace'):
        _sources(payload[key],key,evidence)
    for index,row in enumerate(payload['research']['snapshots']):
        _sources(row,f'research.snapshots.{index}',evidence,interval='1d',basis=row['analysis']['provenance']['price_basis'])
    manifest=[]
    for key,value in payload.items():
        manifest.append(ContextSection(name=key,status=value.get('status','available'),reason=value.get('reason'),bytes=len(canonical(value).encode())))
    for name,bars in [('daily_history',analysis['bars']),('hourly_history',hourly.get('bars',[])),('benchmark_history',benchmark.get('bars',[]))]:
        manifest.append(ContextSection(name=name,status='available' if bars else 'unavailable',reason=None if bars else 'No completed history available.',count=len(bars),first_date=str(bars[0]['time']) if bars else None,last_date=str(bars[-1]['time']) if bars else None,bytes=len(canonical(bars).encode())))
    fingerprint=hashlib.sha256(canonical(dict(payload=_semantic(payload),model=config.model,reasoning=config.reasoning,max_output_tokens=config.max_output_tokens)).encode()).hexdigest()
    ctx=AiContext(payload=payload,evidence=evidence,manifest=manifest,fingerprint=fingerprint,daily_actionable=analysis['assessment']['data_quality']['actionable'])
    size=len(context_json(ctx).encode())
    if size>config.max_context_bytes:
        raise AiError('context_too_large',f'Complete context is {size} bytes; limit is {config.max_context_bytes}. No AI request was sent.')
    return ctx
