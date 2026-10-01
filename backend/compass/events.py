"""Estimated company events from source evidence, with cache-only aggregation."""
from datetime import datetime, timezone, timedelta, date
from math import isfinite
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from compass.models import EarningsRow
from compass.normalization import utcnow

TIMESTAMP_FIELDS = ('earningsTimestamp', 'earningsTimestampStart', 'earningsTimestampEnd')


def provider_earnings(info, exchange_timezone, retrieved_at):
    """Retain source candidates; never let malformed metadata break price downloads."""
    data = {key: info[key] for key in TIMESTAMP_FIELDS if key in info}
    # SQLite JSON cannot serialize NaN, so retain invalid evidence as a string.
    for key, value in data.items():
        if isinstance(value, float) and not isfinite(value):
            data[key] = str(value)
    data.update(estimated=True, source='Yahoo metadata', exchange_timezone=exchange_timezone)
    row = earnings_row(dict(symbol='', name='', timezone=exchange_timezone,
        instrument_type='EQUITY', synthetic=False), dict(data=data, retrieved_at=retrieved_at))
    if row.status == 'estimated':
        data.update(date=row.date_start, date_start=row.date_start, date_end=row.date_end,
                    date_basis=row.date_basis)
    return dict(status='available' if row.status == 'estimated' else 'unavailable',
                reason=None if row.status == 'estimated' else 'Next earnings date unknown. Event risk cannot be excluded.',
                data=data, retrieved_at=retrieved_at)


def _freshness(value, now):
    try:
        at = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if at.tzinfo is None:
            return 'unknown'
        age = now - at
        if age < timedelta(0):
            return 'unknown'
        return 'fresh' if age <= timedelta(hours=24) else 'stale'
    except (AttributeError, TypeError, ValueError, OverflowError):
        return 'unknown'


def _instant(value):
    if isinstance(value, bool):
        raise ValueError('Boolean is not a timestamp')
    number = float(value)
    if not isfinite(number):
        raise ValueError('Nonfinite timestamp')
    return datetime.fromtimestamp(number, timezone.utc)


def earnings_row(instrument, earnings=None, *, source='yfinance', now=None,
                 window_days=30, refresh_error=None, cached=True):
    now = now or utcnow()
    instrument = instrument.model_dump() if hasattr(instrument, 'model_dump') else instrument
    earnings = earnings.model_dump() if hasattr(earnings, 'model_dump') else earnings
    earnings = earnings if isinstance(earnings, dict) else {}
    data = earnings.get('data')
    data = data if isinstance(data, dict) else {}
    retrieved = earnings.get('retrieved_at')
    retrieved = retrieved if isinstance(retrieved, str) else None
    row = EarningsRow(symbol=instrument['symbol'], name=instrument.get('name') or instrument['symbol'],
        status='unknown', source=data.get('source') if isinstance(data.get('source'), str) else ('Yahoo metadata' if source == 'yfinance' and earnings else None),
        retrieved_at=retrieved, freshness=_freshness(retrieved, now), refresh_error=refresh_error,
        exchange_timezone=data.get('exchange_timezone', instrument.get('timezone')))
    if instrument.get('synthetic') or source == 'demo':
        row.status, row.reason_code = 'not_applicable', 'synthetic'
        return row
    if source == 'csv':
        row.reason_code = 'csv_identity_unverified'
        return row
    if instrument.get('instrument_type') == 'ETF':
        row.status, row.reason_code = 'not_applicable', 'etf'
        return row
    if not cached:
        row.reason_code = 'no_cache'
        return row
    raw = {key:data[key] for key in TIMESTAMP_FIELDS if data.get(key) is not None}
    if not raw:
        legacy = data.get('date')
        try:
            row.last_reported_date = date.fromisoformat(legacy).isoformat()
        except (TypeError, ValueError):
            pass
        row.reason_code = 'legacy_date_unverified' if row.last_reported_date else 'earnings_unknown'
        return row
    try:
        exchange = ZoneInfo(row.exchange_timezone)
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        row.reason_code = 'exchange_timezone_unknown'
        return row
    today = now.astimezone(exchange).date()
    instants = {}
    invalid = False
    for key, value in raw.items():
        try:
            instants[key] = _instant(value)
        except (TypeError, ValueError, OverflowError, OSError):
            invalid = True
    start, end = instants.get('earningsTimestampStart'), instants.get('earningsTimestampEnd')
    if start and end and end < start:
        row.reason_code = 'invalid_range'
        return row
    candidates = []
    if start:
        candidates.append((start.astimezone(exchange).date(), (end or start).astimezone(exchange).date()))
    elif end:
        candidates.append((end.astimezone(exchange).date(), end.astimezone(exchange).date()))
    exact = instants.get('earningsTimestamp')
    if exact:
        candidates.append((exact.astimezone(exchange).date(), exact.astimezone(exchange).date()))
    # A supplied but malformed range must not silently become an exact guess.
    if ('earningsTimestampStart' in raw and not start) or ('earningsTimestampEnd' in raw and not end):
        row.reason_code = 'invalid_timestamps'
        return row
    upcoming = [(s,e) for s,e in candidates if e >= today]
    if not upcoming:
        row.reason_code = 'past_event' if candidates else 'invalid_timestamps' if invalid else 'earnings_unknown'
        if candidates:
            row.last_reported_date = max(e for _,e in candidates).isoformat()
        return row
    # Range evidence wins over the exact candidate and remains intact.
    first, last = upcoming[0]
    row.status = 'estimated'
    row.date_start, row.date_end = first.isoformat(), last.isoformat()
    row.date_basis = 'exchange_local'
    row.in_window = first <= today + timedelta(days=window_days) and last >= today
    return row


def cached_event(service, symbol, *, now=None, window_days=30):
    value = service.store.cached(service.key(symbol))
    source = service.source(symbol)
    instrument = value.get('instrument', {}) if value else {}
    instrument = {'name':symbol, **instrument, 'symbol':symbol}
    return earnings_row(instrument, value.get('context', {}).get('earnings') if value else None,
        source=source, now=now, window_days=window_days,
        refresh_error=service.store.get('failure:' + symbol), cached=value is not None)


def watchlist_events(service, mode, window_days):
    now = utcnow()
    rows = [cached_event(service, symbol, now=now, window_days=window_days)
        for symbol in service.store.watchlist()
        if symbol.startswith('DEMO_') == (mode == 'demo')]
    rows.sort(key=lambda r:(not r.in_window, r.date_start or '9999', r.symbol))
    return dict(generated_at=now.isoformat(), mode=mode, offline=service.offline,
                freshness_hours=24, rows=rows)
