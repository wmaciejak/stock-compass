"""Constant-return savings scenarios with end-of-month contributions."""
from compass.models import PlanningInput, PlanningPoint, PlanningResult


def project(inputs: PlanningInput) -> PlanningResult:
    gross_factor = (1 + inputs.annual_return / 100) ** (1 / 12)
    net_factor = ((1 + inputs.annual_return / 100) * (1 - inputs.annual_fee / 100)) ** (1 / 12)
    gross = net = inputs.initial_amount
    series = [PlanningPoint(year=0, contributed=inputs.initial_amount, before_fees=gross, after_fees=net)]
    for month in range(1, inputs.years * 12 + 1):
        gross = gross * gross_factor + inputs.monthly_contribution
        net = net * net_factor + inputs.monthly_contribution
        if month % 12 == 0:
            series.append(PlanningPoint(year=month // 12,
                contributed=inputs.initial_amount + month * inputs.monthly_contribution,
                before_fees=gross, after_fees=net))
    contributed = inputs.initial_amount + inputs.years * 12 * inputs.monthly_contribution
    return PlanningResult(inputs=inputs, total_contributed=contributed,
        ending_value=net, growth=net-contributed, fee_impact=gross-net,
        goal_gap=None if inputs.target_amount is None else inputs.target_amount-net,
        series=series,
        assumptions='Hypothetical constant effective annual returns and proportional ongoing fees; contributions at month end. Fee impact includes foregone growth. Excludes taxes, inflation, transaction costs, FX movements and changing market prices. Currency is a display unit, with no conversion.')
