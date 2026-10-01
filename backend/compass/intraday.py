"""Completed regular-session hourly chart data. No intraday recommendation engine."""
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from compass.normalization import schedule, utcnow
from compass.indicators import calculate, ENGINE
from compass.rules import causal_zones
from compass.models import Instrument, HourlyChart
from compass.providers.base import ProviderError
from compass.providers.demo import DemoProvider
from compass.providers.yahoo import YahooProvider
from compass.service import symbol_name, encode_frame, decode_frame

ALLOWANCE = pd.Timedelta(minutes=20)


def hourly_grid(start, end):
    bins = []
    for row in schedule(start, end).itertuples():
        at = row.market_open
        while at < row.market_close:
            finish = min(at + pd.Timedelta(hours=1), row.market_close)
            bins.append((at, finish))
            at += pd.Timedelta(hours=1)
    return bins


def normalize_hourly(native, now=None, synthetic=False, observed_at=None):
    now = pd.Timestamp(now or utcnow())
    # A partial candle captured earlier cannot become complete inside the cache.
    completion_cutoff = min(now, pd.Timestamp(observed_at)) if observed_at is not None and not synthetic else now
    f = native.copy()
    if any(c not in f for c in ['Open','High','Low','Close','Volume']):
        raise ValueError('Hourly history requires Open, High, Low, Close and Volume.')
    idx = pd.to_datetime(f.index, errors='coerce')
    if idx.isna().any() or not isinstance(idx, pd.DatetimeIndex) or idx.tz is None:
        raise ValueError('Hourly history requires valid timezone-aware timestamps.')
    f.index = idx.tz_convert('UTC')
    issues=[]
    if f.index.duplicated().any():
        issues.append('Duplicate hourly bars excluded; native data remain in cache.')
        f = f[~f.index.duplicated(keep='first')]
    if not f.index.is_monotonic_increasing:
        issues.append('Hourly bars sorted; native order remains in cache.')
    f=f.sort_index()
    if f.empty:
        raise ValueError('No hourly candles available.')
    for c in ['Open','High','Low','Close','Volume']:
        f[c]=pd.to_numeric(f[c],errors='coerce')
    valid=(np.isfinite(f[['Open','High','Low','Close']]).all(axis=1)
           &(f[['Open','High','Low','Close']]>0).all(axis=1)
           &(f.High>=f[['Open','Close','Low']].max(axis=1))
           &(f.Low<=f[['Open','Close','High']].min(axis=1)))
    if not valid.all():
        issues.append('Invalid hourly OHLC bars excluded; remaining data are for inspection.')
    f=f[valid]
    if f.empty:
        raise ValueError('No valid hourly candles remain.')
    grid=hourly_grid((f.index[0]-pd.Timedelta(days=14)).date().isoformat(),max(f.index[-1],now).date().isoformat())
    ends=dict(grid)
    outside=~f.index.isin(ends)
    if outside.any():
        issues.append('Out-of-session or misaligned hourly bars excluded.')
    f=f[~outside]
    unfinished=[at for at in f.index if ends[at]>completion_cutoff]
    if unfinished:
        issues.append('Unfinished hourly candles excluded.')
        if any(ends[at]<=now for at in unfinished):
            issues.append('Cached hourly candles captured before completion remain excluded until refreshed.')
        f=f.drop(unfinished)
    missing_volume=(~np.isfinite(f.Volume))|(f.Volume<=0)
    if missing_volume.any():
        issues.append('Missing or invalid hourly volume; affected volume indicators are unavailable.')
        f.loc[missing_volume,'Volume']=np.nan
    missing=[]
    if len(f):
        missing=[at.isoformat() for at,finish in grid if f.index[0]<=at<=f.index[-1] and finish<=now and at not in f.index]
    if missing:
        issues.append('Missing hourly sessions; candles were not filled.')
    published=[(at,end) for at,end in grid if end+ALLOWANCE<=now]
    expected=published[-1][0] if published else None
    stale=not len(f) or (expected is not None and f.index[-1]<expected)
    if synthetic:
        stale=False
    if stale:
        issues.append('Hourly history is stale relative to the latest expected published candle.')
    if len(f)<200:
        issues.append('Short hourly history: unavailable indicators remain blank; SMA 200 needs 200 bars.')
    return f,dict(stale=stale,issues=issues,missing_bars=missing,provisional_bars=len(unfinished),bars=len(f),expected_completed_bar=expected.isoformat() if expected is not None else None)


def hourly_chart(service, symbol, refresh=False, allow_download=True, now=None):
    symbol=symbol_name(symbol)
    source=service.source(symbol)
    if source=='csv':
        raise ProviderError('This CSV contains daily candles only. Hourly prices cannot be inferred from daily OHLC.','unsupported_interval')
    convention='split_dividend_adjusted' if source=='demo' else 'provider_native'
    key=f'{source}:{symbol}:1h:60d:{convention}-v2'
    cached=service.store.cached(key)
    value=cached
    failure_key='hourly-failure:'+key
    failure=service.store.get(failure_key)
    fetched=False
    if (not cached or refresh) and allow_download:
        try:
            if source=='yfinance' and service.offline:
                raise ProviderError('Offline mode: hourly market downloads are disabled. Use the synthetic hourly demo.','offline')
            if failure and utcnow()-datetime.fromisoformat(failure['at'])<timedelta(minutes=2):
                raise ProviderError(failure['message']+' Retry cooldown is two minutes.','cooldown')
            observed_at=utcnow().isoformat()
            bundle=(DemoProvider() if source=='demo' else YahooProvider()).fetch_hourly(symbol)
            value=dict(instrument=bundle.instrument.model_dump(),native=encode_frame(bundle.native),basis=bundle.basis,source=bundle.source,observed_at=observed_at,retrieved_at=utcnow().isoformat())
            service.store.cache(key,value)
            service.store.set(failure_key,None)
            failure=None
            fetched=True
        except ProviderError as e:
            if e.code!='cooldown':
                failure=dict(at=utcnow().isoformat(),message=str(e),code=e.code)
                service.store.set(failure_key,failure)
            if not cached:
                raise
    if not value:
        raise ProviderError('Hourly history has not been loaded.','not_cached')
    instrument=Instrument(**value['instrument'])
    native=decode_frame(value['native'])
    # Hourly Yahoo adjclose can be synthesized from Close. Keep native OHLC
    # consistent and disclose the unverified corporate-action convention.
    frame,q=normalize_hourly(native,now=now,synthetic=instrument.synthetic,observed_at=value.get('observed_at',value['retrieved_at']))
    if source=='yfinance':
        q['issues'].append('Provider-native hourly OHLC. Split/dividend adjustment is not independently verified; indicators are for chart inspection only.')
    if failure:
        q['issues'].append('Hourly refresh failed; cached history: '+failure['message'])
    if frame.empty:
        raise ProviderError('No completed regular-session hourly candles available.','no_data')
    indicators=calculate(frame)
    bars=[]
    for at,row in indicators.iterrows():
        bars.append(dict(time=int(at.timestamp()),**{c:float(v) if np.isfinite(v) else None for c,v in row.items() if c not in ['engulfing','hammer','shooting_star']}))
    zones=causal_zones(indicators,len(indicators)-1,time_format='%Y-%m-%dT%H:%M:%S%z')
    last=frame.index[-1]
    last_end=dict(hourly_grid(last.date().isoformat(),last.date().isoformat()))[last]
    return HourlyChart(symbol=symbol,interval='1h',synthetic=instrument.synthetic,engine=ENGINE,bars=bars,zones=zones,source=value['source'],price_basis=value['basis'],retrieved_at=value['retrieved_at'],exchange_timezone=instrument.timezone,last_completed_bar=last.isoformat(),last_completed_end=last_end.isoformat(),cache=not fetched,quality=q,publication_allowance_minutes=20)
