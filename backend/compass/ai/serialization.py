"""Compact AI transport; the captured app context retains its original precision."""
import json

ENCODING_VERSION = 'stock-compass-columns-v4'
HISTORICAL_INDICATOR_DECIMALS = 6
HISTORICAL_INDICATOR_WINDOW_BARS = 32
PRICE_COLUMNS = {'Open', 'High', 'Low', 'Close', 'Volume'}
INDICATOR_COLUMNS = {
    'sma20', 'sma50', 'sma200', 'ema20', 'slope50', 'adx14', 'rsi14',
    'macd', 'macd_signal', 'macd_hist', 'atr14', 'atr_pct', 'bb_upper',
    'bb_middle', 'bb_lower', 'volume_ratio', 'obv', 'high20', 'low20',
    'high55', 'low55', 'engulfing', 'hammer', 'shooting_star',
}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def encode_rows(rows):
    columns = list(dict.fromkeys(k for row in rows for k in row))
    return dict(columns=columns, rows=[[r.get(k) for k in columns] for r in rows])


def decode_rows(table):
    return [dict(zip(table['columns'], row)) for row in table['rows']]


def _request_payload(value):
    if isinstance(value, dict):
        result = {key: _request_payload(child) for key, child in value.items()}
        rows = value.get('bars')
        if (isinstance(rows, list) and rows
            and all(isinstance(row, dict) and 'time' in row and PRICE_COLUMNS <= set(row) for row in rows)
            and any(INDICATOR_COLUMNS & set(row) for row in rows)):
            result['bars'] = [{key: item for key, item in row.items() if key not in INDICATOR_COLUMNS} for row in rows]
            result['indicator_history'] = [
                {key: round(item, HISTORICAL_INDICATOR_DECIMALS) if key in INDICATOR_COLUMNS and isinstance(item, float) else item
                 for key, item in row.items() if key == 'time' or key in INDICATOR_COLUMNS}
                for row in rows[-HISTORICAL_INDICATOR_WINDOW_BARS:]
            ]
        return result
    if isinstance(value, list):
        return [_request_payload(child) for child in value]
    return value


def _pack_series(values):
    packed = []
    index = 0
    while index < len(values):
        value = values[index]
        key = canonical(value)
        end = index + 1
        while end < len(values) and canonical(values[end]) == key:
            end += 1
        literal = {'literal': value} if isinstance(value, dict) else value
        run = {'repeat': end-index, 'value': value}
        literal_bytes = (len(canonical(literal))+1) * (end-index) - 1
        if len(canonical(run)) < literal_bytes:
            packed.append(run)
        else:
            packed.extend([literal] * (end-index))
        index = end
    return packed


def evidence_groups(context):
    groups = {}
    for ref, source in sorted(context.evidence.items()):
        groups.setdefault((source.kind, source.interval, source.price_basis), []).append(ref)
    return groups


def evidence_catalog(context):
    """The wire's group order defines one stable, zero-based citation catalog."""
    return [ref for refs in evidence_groups(context).values() for ref in refs]


def serialize_context(context):
    tables, series, table_ids, series_ids = {}, {}, {}, {}

    def share(values):
        packed = _pack_series(values)
        key = canonical(packed)
        if key not in series_ids:
            ref = f's{len(series_ids)}'
            series_ids[key] = ref
            series[ref] = packed
        return {'series_ref': series_ids[key]}

    def compact(value, path=()):
        if (isinstance(value, list) and value
            and all(isinstance(row, dict) and 'time' in row and set(row) == set(value[0]) for row in value)):
            columns = sorted(value[0])
            refs = {}
            for name in columns:
                values = [row[name] for row in value]
                refs[name] = share(values)
            table = {'count': len(value), 'columns': refs}
            key = canonical(table)
            if key not in table_ids:
                ref = f't{len(table_ids)}'
                table_ids[key] = ref
                tables[ref] = table
            return {'table_ref': table_ids[key], 'count': len(value)}
        if isinstance(value, dict):
            return {key: compact(child, path+(key,)) for key, child in sorted(value.items())}
        if isinstance(value, list):
            return [compact(child, path+(str(index),)) for index, child in enumerate(value)]
        return value

    payload = compact(_request_payload(context.payload))
    groups, overrides = evidence_groups(context), {}
    for ref, source in sorted(context.evidence.items()):
        if source.path != ref:
            overrides[ref] = source.path
    indexed_groups = []
    offset = 0
    for (kind, interval, basis), refs in groups.items():
        indexed_groups.append(dict(kind=kind, interval=interval, price_basis=basis, refs=refs, first_source_index=offset))
        offset += len(refs)
    document = dict(
        context=payload, tables=tables, series=series,
        manifest=[section.model_dump() for section in context.manifest],
        evidence_sources=indexed_groups,
        encoding=dict(version=ENCODING_VERSION, historical_indicator_decimals=HISTORICAL_INDICATOR_DECIMALS,
                      historical_indicator_window_bars=HISTORICAL_INDICATOR_WINDOW_BARS),
    )
    if overrides:
        document['evidence_path_overrides'] = overrides
    return canonical(document)
