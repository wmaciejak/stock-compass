from uuid import uuid4
import hashlib
from compass.service import symbol_name
from compass.normalization import utcnow
from .models import AiSummaryRequest, AiError, AiRunView
from .context import canonical, prepare_context, build_context
from .client import generate_summary, check_request_budget


class AiJobs:
    def __init__(self,store,service,config,client=None):
        self.store,self.service,self.config,self.client=store,service,config,client

    def submit(self,symbol,request):
        symbol=symbol_name(symbol)
        if self.service.offline or not self.config.enabled:
            raise AiError('ai_offline' if self.service.offline else 'ai_disabled','AI is disabled, offline, or missing its backend API key. Configure Settings & data first.')
        if symbol.startswith('DEMO_') != (request.mode=='demo'):
            raise AiError('context_unavailable','The selected ticker and workspace mode do not match.')
        for peer in request.browser_context.comparison_symbols:
            symbol_name(peer)
        body=request.model_dump(mode='json')
        submission_hash=hashlib.sha256(canonical(dict(symbol=symbol,request={k:v for k,v in body.items() if k!='client_request_id'})).encode()).hexdigest()
        now=utcnow().isoformat()
        record=dict(id=str(uuid4()),symbol=symbol,horizon=request.horizon,language=request.language,state='preparing',request=body,
                    submission_hash=submission_hash,created_at=now,updated_at=now,result=None,error=None,api_call_count=0)
        reserved=self.store.ai_reserve(record)
        return self.get(reserved['id'])

    def execute(self,run_id):
        if not self.store.ai_claim(run_id): return
        record=self.store.ai_record(run_id)
        request=AiSummaryRequest(**record['request'])
        try:
            prepare_context(self.service,request,record['symbol'])
            snapshot=self.store.read_ai_snapshot(record['symbol'],request.browser_context.comparison_symbols)
            context=build_context(snapshot,request,self.config,now=utcnow())
            cached=self.store.ai_find(fingerprint=context.fingerprint)
            if cached and not request.force:
                self.store.ai_update(run_id,state='succeeded',fingerprint=context.fingerprint,result=cached['result'],context=context.model_dump(mode='json'),reused_from=cached['id'])
                return
            self.store.ai_update(run_id,state='running',fingerprint=context.fingerprint,context=context.model_dump(mode='json'),api_call_count=0)
            if self.client is None or hasattr(self.client.responses,'input_tokens'):
                check_request_budget(context,self.config,client=self.client)
            self.store.ai_update(run_id,api_call_count=1)
            summary=generate_summary(context,request,self.config,client=self.client)
            self.store.ai_update(run_id,state='succeeded',result=summary.model_dump(mode='json'))
        except AiError as e:
            error=dict(code=e.code,message=str(e))
            if e.diagnostics:
                error['diagnostics']=e.diagnostics
            self.store.ai_update(run_id,state='delivery_unknown' if e.delivery_unknown else 'failed',error=error)
        except Exception:
            self.store.ai_update(run_id,state='failed',error=dict(code='provider_unavailable',message='The AI job could not complete. No automatic retry was made.'))

    def get(self,run_id):
        record=self.store.ai_record(run_id)
        if not record: raise AiError('not_found','AI job not found.')
        changed=False
        if record.get('result'):
            try:
                request=AiSummaryRequest(**record['request'])
                current=build_context(self.store.read_ai_snapshot(record['symbol'],request.browser_context.comparison_symbols),request,self.config,now=utcnow())
                changed=current.fingerprint!=record['fingerprint']
            except (AiError,ValueError): changed=True
        return AiRunView(**{k:record[k] for k in ('id','symbol','horizon','language','state','created_at','updated_at')},
                         result=record.get('result'),error=record.get('error'),context_changed=changed,reused_from=record.get('reused_from'))

    def latest(self,symbol,*,horizon,language):
        record=self.store.ai_find(symbol=symbol_name(symbol),horizon=horizon,language=language)
        return self.get(record['id']) if record else None

    def by_request(self, client_request_id):
        run_id = self.store.ai_request_run(client_request_id)
        if not run_id:
            raise AiError('not_found','AI job not found.')
        return self.get(run_id)

    def recover_interrupted(self):
        return self.store.ai_recover()

    def status(self):
        value=self.config.public_status()
        active=self.store.ai_find(active=True)
        value['active_run']=dict(id=active['id'],symbol=active['symbol'],horizon=active['horizon'],language=active['language']) if active else None
        return value
