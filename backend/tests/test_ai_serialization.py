from copy import deepcopy
import json

from compass.ai.context import context_json, PROMPT_VERSION
from compass.ai.models import AiContext, EvidenceSource


def decode_document(document):
    """Independent decoder for the documented shared-series wire format."""
    def series(reference):
        values = []
        for item in document['series'][reference]:
            if isinstance(item, dict) and set(item) == {'repeat', 'value'}:
                values.extend([item['value']] * item['repeat'])
            elif isinstance(item, dict) and set(item) == {'literal'}:
                values.append(item['literal'])
            else:
                values.append(item)
        return values
    def walk(value):
        if isinstance(value, dict) and set(value) == {'table_ref', 'count'}:
            table = document['tables'][value['table_ref']]
            columns = {name: series(ref['series_ref']) for name, ref in table['columns'].items()}
            assert all(len(v) == table['count'] == value['count'] for v in columns.values())
            return [{name: values[i] for name, values in columns.items()} for i in range(table['count'])]
        if isinstance(value, dict):
            return {k: walk(v) for k, v in value.items()}
        if isinstance(value, list):
            return [walk(v) for v in value]
        return value
    return walk(document['context'])


def context(payload, evidence=None):
    return AiContext(payload=payload, evidence=evidence or {}, manifest=[], fingerprint='fixture', daily_actionable=True)


def bars(count=500):
    return [dict(time=f'2026-{i:04d}', Open=101.12345678901234, High=104.98765432101234,
                 Low=99.11111111111111, Close=102.33333333333333, Volume=1234567.89012345,
                 sma20=101.12345678901234, rsi14=None if i < 14 else 59.12345678901234,
                 high55=104.98765432101234, hammer=0, macd=-0.123456789012345) for i in range(count)]


def test_only_historical_bar_indicators_round_and_input_stays_frozen():
    original = bars(30)
    payload = {
        'daily': {'bars': original, 'metrics': {'sma20': original[-1]['sma20']},
                  'assessment': {'scenario': {'entry': 103.12345678901234}}, 'price_basis': 'adjusted'},
        'hourly': {'bars': deepcopy(original), 'price_basis': 'provider_native'},
        'research': {'saved_note': 'Keep 101.12345678901234 exactly', 'snapshots': [
            {'analysis': {'bars': deepcopy(original), 'metrics': {'rsi14': 59.12345678901234}}}]},
        'backtests': {'equity': [{'time': '2026-09-30', 'strategy': 12000.123456789, 'sma20': 99.123456789}]},
    }
    captured = deepcopy(payload)
    wire = json.loads(context_json(context(payload)))
    restored = decode_document(wire)
    expected = deepcopy(captured)
    for analysis in (expected['daily'], expected['hourly'], expected['research']['snapshots'][0]['analysis']):
        rows = analysis['bars']
        indicator_names = {'sma20', 'rsi14', 'high55', 'hammer', 'macd'}
        analysis['bars'] = [{k:v for k,v in row.items() if k not in indicator_names} for row in rows]
        analysis['indicator_history'] = [{k:round(v,6) if isinstance(v,float) else v
                                        for k,v in row.items() if k=='time' or k in indicator_names} for row in rows[-32:]]
    assert restored == expected
    assert payload == captured
    assert wire['encoding']['historical_indicator_decimals'] == 6
    assert wire['encoding']['historical_indicator_window_bars'] == 32
    assert wire['encoding']['version'] == 'stock-compass-columns-v4'
    assert PROMPT_VERSION == 'stock-compass-ai-v4'


def test_repeated_columns_and_tables_share_one_series_without_losing_dates_or_nulls():
    rows = bars(500)
    payload = {'daily': {'bars': rows}, 'snapshot': {'bars': deepcopy(rows)}}
    wire = json.loads(context_json(context(payload)))
    assert len(wire['tables']) == 2
    table = next(t for t in wire['tables'].values() if 'Open' in t['columns'])
    assert table['count'] == 500
    assert 'sma20' not in table['columns']
    assert any(isinstance(item, dict) and item.get('repeat', 0) > 100 for values in wire['series'].values() for item in values)
    decoded = decode_document(wire)
    assert len(decoded['daily']['bars']) == 500
    assert [r['time'] for r in decoded['daily']['bars']] == [r['time'] for r in rows]
    assert len(decoded['daily']['indicator_history']) == 32
    assert [r['time'] for r in decoded['daily']['indicator_history']] == [r['time'] for r in rows[-32:]]
    assert all(r['rsi14']==59.123457 for r in decoded['daily']['indicator_history'])
    assert decoded['daily'] == decoded['snapshot']
    assert len(context_json(context(payload))) < len(json.dumps(payload, separators=(',', ':'))) / 4


def test_evidence_groups_preserve_ids_paths_and_price_bases():
    evidence = {
        'daily.metrics.Close': EvidenceSource(label='Close', category='daily', path='daily.metrics.Close', value=101.12345678901234,
                                            kind='price', interval='1d', price_basis='adjusted'),
        'hourly.metrics.Close': EvidenceSource(label='Close', category='hourly', path='hourly.metrics.Close', value=101.12345678901234,
                                             kind='price', interval='1h', price_basis='provider_native'),
        'note': EvidenceSource(label='Note', category='research', path='research.saved_note', value='Private note'),
    }
    wire = json.loads(context_json(context({'research': {'saved_note': 'Private note'}}, evidence)))
    restored = {}
    for group in wire['evidence_sources']:
        for ref in group['refs']:
            restored[ref] = {**{k:group[k] for k in ('kind','interval','price_basis')},
                            'path':wire.get('evidence_path_overrides',{}).get(ref, ref)}
    assert restored == {ref:{k:getattr(source,k) for k in ('kind','interval','price_basis','path')} for ref,source in evidence.items()}


def test_heterogeneous_records_and_literal_run_objects_are_preserved():
    payload = {'heterogeneous': [{'time':'a','value':None}, {'time':'b'}],
               'homogeneous': [{'time':str(i), 'value':{'repeat':20,'value':0}} for i in range(5)]}
    assert decode_document(json.loads(context_json(context(payload)))) == payload


def test_series_pool_keeps_booleans_numbers_and_signed_zero_distinct():
    payload = {'values': [{'time':str(i), 'value':v} for i,v in enumerate([False,0,0.0,-0.0,True,1,1.0])]}
    restored = decode_document(json.loads(context_json(context(payload))))
    assert json.dumps(restored, sort_keys=True) == json.dumps(payload, sort_keys=True)


def test_canonical_encoding_does_not_depend_on_object_insertion_order():
    a={'daily':{'bars':bars(2)},'research':{'saved_note':'A'}}
    b={'research':{'saved_note':'A'},'daily':{'bars':[{k:r[k] for k in reversed(r)} for r in bars(2)]}}
    assert context_json(context(a)) == context_json(context(b))
