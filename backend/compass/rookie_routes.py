from typing import Literal
from fastapi import APIRouter
from compass.models import Onboarding, PlanningInput, PlanningResult
from compass.planning import project
from compass.events import watchlist_events


def create_rookie_router(service):
    router = APIRouter(prefix='/api')
    store = service.store

    @router.get('/onboarding', response_model=Onboarding)
    def onboarding():
        return Onboarding.model_validate(store.get('onboarding', {}))

    @router.put('/onboarding', response_model=Onboarding)
    def save_onboarding(value: Onboarding):
        store.set('onboarding', value.model_dump())
        return value

    @router.post('/planning/scenario', response_model=PlanningResult)
    def scenario(value: PlanningInput):
        return project(value)

    @router.get('/planning/plan', response_model=PlanningInput | None)
    def plan():
        saved = store.get('long_term_plan')
        return None if saved is None else PlanningInput.model_validate(saved)

    @router.put('/planning/plan', response_model=PlanningInput)
    def save_plan(value: PlanningInput):
        store.set('long_term_plan', value.model_dump())
        return value

    @router.get('/watchlist/events')
    def events(mode: Literal['demo','live'] = 'demo', window_days: int = 30):
        if window_days not in (30, 90):
            raise ValueError('Choose a 30-day or 90-day window.')
        return watchlist_events(service, mode, window_days)

    return router
