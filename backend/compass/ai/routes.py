from fastapi import APIRouter, BackgroundTasks, HTTPException, Response
from compass.models import Horizon
from .models import AiSummaryRequest, AiRunView
from typing import Literal
from uuid import UUID


def create_ai_router(jobs):
    router=APIRouter(prefix='/api/ai')

    @router.get('/status')
    def status():
        return jobs.status()

    @router.post('/summaries/{symbol}',response_model=AiRunView)
    def submit(symbol:str,request:AiSummaryRequest,tasks:BackgroundTasks,response:Response):
        run=jobs.submit(symbol,request)
        if run.state=='preparing':
            tasks.add_task(jobs.execute,run.id)
        response.status_code=202 if run.state in ('preparing','running') else 200
        return run

    @router.get('/runs/{run_id}',response_model=AiRunView)
    def run(run_id:str):
        return jobs.get(run_id)

    @router.get('/requests/{client_request_id}',response_model=AiRunView)
    def by_request(client_request_id:UUID):
        return jobs.by_request(client_request_id)

    @router.get('/summaries/{symbol}',response_model=AiRunView|None)
    def latest(symbol:str,horizon:Horizon='2–8 weeks',language:Literal['en','pl']='en'):
        return jobs.latest(symbol,horizon=horizon,language=language)

    return router
