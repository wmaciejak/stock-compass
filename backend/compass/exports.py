import csv
from io import StringIO
import json
from compass.localization import translate, translate_values


def markdown_report(a, backtests=None, language="en"):
    d = a.model_dump()
    p = d["provenance"]
    s = d["assessment"]
    m = d["metrics"]
    instrument = d["instrument"]
    lines = [
        f"# Stock Compass research: {instrument['symbol']}",
        "**SYNTHETIC DEMO — NOT REAL MARKET DATA**"
        if instrument["synthetic"]
        else f"{instrument['name']} · {instrument['exchange']} · {instrument['currency']}",
        "",
        f"Assessment: **{s['label']}**",
        s["summary"],
        "",
        f"Horizon: {s['horizon']}; rules: {s['rule_version']}; calculation engine: {d['engine']}",
        s["horizon_scope"],
        "Data interval: completed daily bars.",
        f"Analysis timestamp: {s['timestamp']}",
        f"Source: {p['source']}; retrieved: {p['retrieved_at']}; last completed session: {p['last_completed_bar']}",
        f"Price basis: {p['price_basis']}; exchange timezone: {p['exchange_timezone']}; cache: {p['cache']}",
        f"Quality: {json.dumps(s['data_quality'])}",
        "",
        "## Supporting evidence",
    ]
    lines.extend("- " + x for x in s["supporting"])
    lines += ["", "## Opposing evidence"]
    lines.extend("- " + x for x in s["opposing"])
    lines += [
        "",
        "## Next condition",
        s["next_condition"],
        "",
        "## Event risk",
        s["event_risk"],
        "",
        "## Conditional scenario",
    ]
    if s["scenario"]:
        sc = s["scenario"]
        lines += [
            f"Entry reference {sc['entry']:.2f}–{sc['entry_max']:.2f}; invalidation {sc['stop']:.2f}; structural target {sc['target']:.2f}; reward/risk {sc['reward_risk']:.2f}.",
            sc["trigger"],
            sc["basis"],
        ]
    else:
        lines += ["No defensible scenario available."]
    lines += ["", "## Metrics", "Metric | Reading", "--- | ---"] + [
        f"{k} | {v if v is not None else translate('Unavailable', language)}" for k, v in m.items()
    ]
    lines += [
        "",
        "## Benchmark comparison",
        json.dumps(d["relative"]["returns"]),
        "",
        "## Historical evidence",
    ]
    for kind, b in (backtests or {}).items():
        lines += [
            f"### {kind}",
            b["conclusion"],
            b["evidence"],
            json.dumps(b["metrics"]),
            f"Comparable baseline: {json.dumps(b['baseline_metrics'])}",
            f"Evaluation dates: {json.dumps(b['dates'])}",
            f"Costs and execution: {json.dumps(translate_values(b['assumptions'], language), ensure_ascii=False)}",
            f"Recent holdout: {json.dumps(translate_values(b['holdout'], language), ensure_ascii=False)}",
        ]
    if not backtests:
        lines += [
            "No saved backtest for the current data/configuration. Heuristic setup score is not a tested strategy or profit probability."
        ]
    lines += [
        "",
        "## Limitations",
        "Personal research scenario, not personalized suitability. Gaps can exceed stop-based loss. Adjusted OHLC simulations use synthetic economic units; no additional dividend payments. Fixed-rule historical results do not predict the next trade. Unknown earnings is not an absence of risk.",
        "",
        "## Learn more",
    ]
    lines.extend(
        f"- [{e['name']}]({e['url']}): {e['measures']} Common mistake: {e['mistake']}"
        for e in d["education"]
    )
    # The verified company name is external factual data, not a translation key.
    company_line = lines[1] if not instrument["synthetic"] else None
    return "\n".join(
        line if index == 1 and company_line else translate(line, language)
        for index, line in enumerate(lines)
    ) + "\n"


def bars_csv(a):
    io = StringIO()
    fields = [
        "symbol",
        "synthetic",
        "source",
        "retrieved_at",
        "price_basis",
        "rule_version",
    ] + list(a.bars[0])
    writer = csv.DictWriter(io, fieldnames=fields)
    writer.writeheader()
    for bar in a.bars:
        writer.writerow(
            dict(
                symbol=a.instrument.symbol,
                synthetic=a.instrument.synthetic,
                source=a.provenance.source,
                retrieved_at=a.provenance.retrieved_at,
                price_basis=a.provenance.price_basis,
                rule_version=a.assessment.rule_version,
                **bar,
            )
        )
    return io.getvalue()
