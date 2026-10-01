from copy import deepcopy
import json
import pytest
from pydantic import ValidationError

from compass.ai.models import AiContext, EvidenceSource
from compass.ai.context import context_json


def captured(*, actionable=True, scenario=None):
    return AiContext(
        payload={'request': {'symbol': 'DEMO_TEST', 'horizon': '2–8 weeks', 'language': 'en'},
                 'daily': {'assessment': {'scenario': scenario}}},
        evidence={
            'daily.assessment.summary': EvidenceSource(label='Summary', category='daily', path='daily.assessment.summary', value='Wait'),
            'daily.metrics.Close': EvidenceSource(label='Close', category='daily', path='daily.metrics.Close', value=101.12345678901234, kind='price', interval='1d', price_basis='adjusted'),
            'hourly.zones.0.low': EvidenceSource(label='Hourly support', category='hourly', path='hourly.zones.0.low', value=99.87654321012345, kind='price', interval='1h', price_basis='provider_native'),
            'research.saved_note': EvidenceSource(label='Note', category='research', path='research.saved_note', value='Private fixture'),
            'weekly.close': EvidenceSource(label='Weekly close', category='daily', path='weekly.close', value=100, kind='price', interval='1w', price_basis='adjusted'),
        }, manifest=[], fingerprint='test', daily_actionable=actionable)


def output():
    claim={'text': 'Wait for confirmation.', 'source_refs': [0]}
    scene={'outlook': claim, 'confirmation': claim, 'invalidation': claim, 'levels': [], 'events': []}
    return deepcopy(dict(symbol='DEMO_TEST', horizon='2–8 weeks', language='en', summary=claim,
        recommendation='wait_for_confirmation', rationale=[claim], counterargument=claim,
        confidence='moderate', confidence_reason=claim, near_term=claim,
        scenarios={k:scene for k in ('base','bull','bear')}, best_supported_scenario='base',
        next_observations=[claim], risks=[claim], missing_context=[]))


def contract(context):
    from compass.ai import client
    builder=getattr(client,'output_contract',None)
    assert callable(builder), 'The generation schema must enforce captured evidence and quality before billing'
    return builder(context)


@pytest.mark.parametrize('change', [
    {'symbol':'OTHER'}, {'horizon':'1–2 weeks'}, {'language':'pl'},
    {'recommendation':'consider_buy_setup'}, {'scenarios':{}},
])
def test_request_specific_schema_rejects_invalid_identity_and_missing_scenarios(change):
    schema=contract(captured()).schema
    data=output()
    data.update(change)
    with pytest.raises(ValidationError):
        schema.model_validate(data)


@pytest.mark.parametrize('refs', [[],[-1],[5],[True],[0.5],['daily.assessment.summary']])
def test_claim_citations_must_select_existing_catalog_indexes(refs):
    data=output()
    data['summary']['source_refs']=refs
    with pytest.raises(ValidationError):
        contract(captured()).schema.model_validate(data)


def test_restricted_daily_quality_is_enforced_in_generation_schema():
    schema=contract(captured(actionable=False)).schema
    with pytest.raises(ValidationError):
        schema.model_validate(output())
    data=output()
    data['recommendation']='insufficient_data'
    assert schema.model_validate(data).recommendation=='insufficient_data'


def test_selected_levels_are_resolved_from_exact_frozen_evidence():
    context=captured()
    spec=contract(context)
    wire=json.loads(context_json(context))
    catalog={group['first_source_index']+i:ref for group in wire['evidence_sources'] for i,ref in enumerate(group['refs'])}
    assert catalog=={0:'daily.assessment.summary',1:'research.saved_note',2:'daily.metrics.Close',3:'hourly.zones.0.low',4:'weekly.close'}
    data=output()
    data['scenarios']['base']['levels']=[{'label':'Daily observation','role':'observation','source_ref':2},
                                       {'label':'Hourly support','role':'support','source_ref':3}]
    decoded=spec.resolve(spec.schema.model_validate(data))
    assert decoded.summary.source_refs==['daily.assessment.summary']
    assert [s.kind for s in decoded.scenarios]==['base','bull','bear']
    daily,hourly=decoded.scenarios[0].levels
    assert (daily.value,daily.interval,daily.price_basis)==(101.12345678901234,'1d','adjusted')
    assert (hourly.value,hourly.interval,hourly.price_basis)==(99.87654321012345,'1h','provider_native')
    assert context.evidence['daily.metrics.Close'].value==101.12345678901234


@pytest.mark.parametrize('level', [
    {'label':'Invented source','role':'support','source_ref':5},
    {'label':'Fact as price','role':'support','source_ref':0},
    {'label':'Weekly level','role':'support','source_ref':4},
    {'label':'Invented entry','role':'entry','source_ref':2},
    {'label':'Rounded copy','role':'support','source_ref':2,'value':101.12},
])
def test_levels_cannot_invent_prices_bases_or_trading_setups(level):
    data=output()
    data['scenarios']['base']['levels']=[level]
    with pytest.raises(ValidationError):
        contract(captured()).schema.model_validate(data)


def test_existing_daily_setup_enables_only_matching_execution_roles():
    context=captured(scenario={'entry':102.12345678901234})
    context.evidence['daily.assessment.scenario.entry']=EvidenceSource(label='Entry',category='daily',path='daily.assessment.scenario.entry',value=102.12345678901234,kind='price',interval='1d',price_basis='adjusted')
    spec=contract(context)
    data=output()
    data['recommendation']='consider_buy_setup'
    # Price group sorts first here: entry=0, close=1; facts start at 2.
    for name in ('summary','counterargument','confidence_reason','near_term'):
        data[name]['source_refs']=[2]
    data['scenarios']['base']['levels']=[{'label':'Entry','role':'entry','source_ref':0}]
    assert spec.resolve(spec.schema.model_validate(data)).scenarios[0].levels[0].source_ref=='daily.assessment.scenario.entry'
    data['scenarios']['base']['levels'][0]['source_ref']=1
    with pytest.raises(ValidationError):
        spec.schema.model_validate(data)


def test_provider_schema_uses_supported_enums_for_fixed_identity_and_roles():
    from openai.lib._parsing._responses import type_to_text_format_param
    schema=type_to_text_format_param(contract(captured()).schema)['schema']
    assert schema['properties']['symbol']['enum']==['DEMO_TEST']
    assert schema['properties']['recommendation']['enum']==['wait_for_confirmation','avoid_new_entry','insufficient_data']
    assert '"const"' not in json.dumps(schema)
