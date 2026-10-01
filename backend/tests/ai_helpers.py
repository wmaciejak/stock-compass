from types import SimpleNamespace
import json
from compass.ai.models import AiSummaryContent


def make_summary_content(symbol='DEMO_TREND',horizon='2–8 weeks',language='en',actionable=True):
    claim=dict(text='Wait for a completed daily confirmation.',source_refs=['daily.assessment.summary'])
    return AiSummaryContent(symbol=symbol,horizon=horizon,language=language,summary=claim,
        recommendation='wait_for_confirmation' if actionable else 'insufficient_data',rationale=[claim],counterargument=claim,
        confidence='moderate',confidence_reason=claim,near_term=claim,
        scenarios=[dict(kind=k,outlook=claim,confirmation=claim,invalidation=claim,levels=[],events=[]) for k in ('base','bull','bear')],
        best_supported_scenario='base',next_observations=[claim],risks=[claim],missing_context=[])


def wire_content(content, serialized_context):
    document=json.loads(serialized_context)
    indexes={ref:group['first_source_index']+i for group in document['evidence_sources'] for i,ref in enumerate(group['refs'])}
    def walk(value):
        if isinstance(value,dict):
            if 'source_refs' in value:
                value['source_refs']=[indexes.get(ref,ref) for ref in value['source_refs']]
            for child in value.values(): walk(child)
        elif isinstance(value,list):
            for child in value: walk(child)
    data=content.model_dump()
    walk(data)
    scenes={}
    for scene in data['scenarios']:
        for level in scene['levels']:
            level['source_ref']=indexes.get(level['source_ref'],level['source_ref'])
            for field in ('value','interval','price_basis'): level.pop(field)
        scenes[scene.pop('kind')]=scene
    data['scenarios']=scenes
    return data


class RecordingClient:
    def __init__(self,content=None,error=None,status='completed'):
        self.content=content or make_summary_content()
        self.error=error
        self.status=status
        self.calls=[]
        self.responses=self

    @property
    def call_count(self):
        return len(self.calls)

    def create(self,**kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        output=json.dumps(wire_content(self.content,kwargs['input'][1]['content']))
        return SimpleNamespace(output_text=output,status=self.status,output=[],id='resp_test',model='gpt-6.1-sol',usage={'input_tokens':1234,'output_tokens':456})
