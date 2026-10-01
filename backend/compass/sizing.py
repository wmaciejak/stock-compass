from datetime import date
import math


def size_position(
    account,
    account_currency,
    entry,
    stop,
    risk_percent,
    instrument_currency,
    conversion_rate=None,
    conversion_date=None,
):
    if (
        not all(
            math.isfinite(x) and x > 0 for x in [account, entry, stop, risk_percent]
        )
        or risk_percent > 100
    ):
        raise ValueError(
            "Enter finite positive amounts and a risk percentage of at most 100."
        )
    if stop >= entry:
        raise ValueError("For a long idea, invalidation must be below entry.")
    rate = 1.0
    if account_currency != instrument_currency:
        if not conversion_rate or not conversion_date:
            raise ValueError(
                "Different currencies require an explicit dated conversion rate: instrument currency per account currency."
            )
        d = date.fromisoformat(conversion_date)
        if d > date.today():
            raise ValueError("Conversion date cannot be in the future.")
        rate = conversion_rate
    cash = account * rate
    risk = cash * risk_percent / 100
    shares = max(0, min(math.floor(risk / (entry - stop)), math.floor(cash / entry)))
    return dict(
        shares=shares,
        exposure=shares * entry,
        planned_loss=shares * (entry - stop),
        risk_budget=risk,
        remaining_cash=cash - shares * entry,
        currency=instrument_currency,
        formula="shares = floor(min(cash / entry, chosen risk budget / (entry − invalidation)))",
        limitation="Whole shares, no leverage. Gaps and costs can exceed planned stop-based loss. This arithmetic does not establish suitability.",
    )
