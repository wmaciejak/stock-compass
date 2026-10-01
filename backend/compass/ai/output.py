"""Constrain generated selections, then resolve exact facts from frozen evidence."""
from dataclasses import dataclass
import math
from typing import Annotated, Literal, Union
from pydantic import Field, create_model
from .models import StrictModel, AiSummaryContent, AiError
from .serialization import evidence_catalog


def _enum_schema(schema):
    # Pydantic emits const for a one-value Literal. Use the documented enum
    # subset without changing the values accepted by the Python type.
    if 'const' in schema:
        schema['enum'] = [schema.pop('const')]


def _selection(values):
    return Annotated[Literal[tuple(values)], Field(json_schema_extra=_enum_schema)]


@dataclass(frozen=True)
class OutputContract:
    schema: type[StrictModel]
    context: object
    catalog: list[str]

    def resolve(self, parsed):
        # Validate again even for injected clients; never trust model_construct.
        data = self.schema.model_validate(parsed.model_dump()).model_dump()

        def claims(value):
            if isinstance(value, dict):
                if 'source_refs' in value:
                    value['source_refs'] = [self.catalog[index] for index in value['source_refs']]
                for child in value.values():
                    claims(child)
            elif isinstance(value, list):
                for child in value:
                    claims(child)
        claims(data)
        scenes = []
        for kind in ('base', 'bull', 'bear'):
            scene = data['scenarios'][kind]
            scene['kind'] = kind
            for level in scene['levels']:
                ref = self.catalog[level['source_ref']]
                source = self.context.evidence[ref]
                level.update(source_ref=ref, value=source.value, interval=source.interval, price_basis=source.price_basis)
            scenes.append(scene)
        data['scenarios'] = scenes
        return AiSummaryContent(**data)


def output_contract(context):
    catalog = evidence_catalog(context)
    if not catalog:
        raise AiError('context_unavailable', 'Usable cited evidence is unavailable.')
    claim = create_model('EvidenceClaim', __base__=StrictModel,
        text=(str, ...), source_refs=(list[Annotated[int, Field(strict=True, ge=0, le=len(catalog)-1)]], Field(min_length=1)))
    prices = [index for index, ref in enumerate(catalog)
              if (source := context.evidence[ref]).kind == 'price'
              and source.interval in ('1d', '1h') and source.price_basis
              and isinstance(source.value, (int, float)) and not isinstance(source.value, bool)
              and math.isfinite(source.value)]
    # The provider caps enums at 1,000 values across the schema. Fail before
    # generation if a workspace's saved snapshots exceed that contract.
    if len(prices) > 900:
        raise AiError('context_unavailable', 'Too many numeric evidence sources for one structured summary.')
    choices = [create_model('ObservedLevel', __base__=StrictModel,
        label=(str, ...), role=(Literal['support','resistance','observation'], ...),
        source_ref=(_selection(prices) if prices else int, ...))]
    scenario = context.payload['daily']['assessment']['scenario']
    if context.daily_actionable and scenario:
        for role in ('entry','entry_max','stop','target'):
            ref = f'daily.assessment.scenario.{role}'
            if ref in catalog and catalog.index(ref) in prices:
                choices.append(create_model(f'{role.title().replace("_", "")}Level', __base__=StrictModel,
                    label=(str, ...), role=(_selection([role]), ...), source_ref=(_selection([catalog.index(ref)]), ...)))
    level = Union[tuple(choices)] if len(choices) > 1 else choices[0]
    scene = create_model('Scenario', __base__=StrictModel,
        outlook=(claim, ...), confirmation=(claim, ...), invalidation=(claim, ...),
        levels=(list[level], ... if prices else Field(max_length=0)), events=(list[claim], ...))
    scenes = create_model('Scenarios', __base__=StrictModel, **{kind:(scene, ...) for kind in ('base','bull','bear')})
    actions = ['wait_for_confirmation','avoid_new_entry','insufficient_data'] if context.daily_actionable else ['insufficient_data']
    if context.daily_actionable and scenario:
        actions.insert(0, 'consider_buy_setup')
    fields = {name:(field.annotation, ...) for name,field in AiSummaryContent.model_fields.items()}
    fields.update({name:(claim, ...) for name in ('summary','counterargument','confidence_reason','near_term')})
    fields.update({name:(list[claim], ...) for name in ('rationale','next_observations','risks')})
    fields.update({name:(_selection([context.payload['request'][name]]), ...) for name in ('symbol','horizon','language')})
    fields.update(scenarios=(scenes, ...), recommendation=(_selection(actions), ...))
    schema = create_model('EvidenceSummary', __base__=StrictModel, **fields)
    return OutputContract(schema, context, catalog)
