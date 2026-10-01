"""Plain-language adapter over the existing assessment; never computes signals."""
from compass.models import BeginnerSummary

EXPLANATIONS = {
    'Buy setup worth considering': 'The current evidence supports examining a possible setup. This is not a personal recommendation and needs confirmation.',
    'Wait for confirmation': 'Some evidence is encouraging, but the existing confirmation condition has not been met.',
    'Unfavorable setup': 'The current evidence weighs against this technical setup.',
    'No clear edge': 'The current evidence does not show a clear technical advantage.',
    'Insufficient or stale data': 'The available daily prices cannot support an actionable assessment.',
}


def beginner_summary(analysis):
    assessment = analysis.assessment
    quality = assessment.data_quality
    if not quality.actionable or quality.stale:
        return BeginnerSummary(conclusion='Insufficient or stale data',
            explanation=EXPLANATIONS['Insufficient or stale data'], caution_kind='data',
            caution='; '.join(quality.issues) or 'Daily data are incomplete or stale.',
            next_condition='Refresh or verify the daily data and adjustment convention before reviewing a setup.',
            supporting=[])
    event = analysis.earnings
    company = not analysis.instrument.synthetic and analysis.instrument.instrument_type != 'ETF'
    if company and event and event.status == 'estimated':
        label = event.date_start if event.date_start == event.date_end else f'{event.date_start} – {event.date_end}'
        kind, caution = 'earnings', f'Provider-estimated earnings date: {label}. Verify the date; a price gap can exceed a planned loss.'
    elif company and (event is None or event.status == 'unknown'):
        kind, caution = 'event_unknown', 'Next earnings timing is unknown or unverified. Event-driven price gaps cannot be excluded.'
    elif assessment.opposing:
        kind, caution = 'opposing', assessment.opposing[0]
    else:
        kind, caution = 'uncertainty', 'The evidence is uncertain. A technical setup does not guarantee future performance.'
    return BeginnerSummary(conclusion=assessment.label, explanation=EXPLANATIONS[assessment.label],
        caution_kind=kind, caution=caution, next_condition=assessment.next_condition,
        supporting=assessment.supporting[:3])
