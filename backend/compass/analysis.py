import math
import numpy as np
import pandas as pd
import talib
from compass.models import Analysis, Assessment, Scenario
from compass.indicators import calculate, ENGINE
from compass.normalization import completed_weekly, utcnow
from compass.rules import decision, causal_zones, VERSION, finite
from compass.explanations import educational_metrics, contextual_lessons, TERMS, HORIZON_SCOPES


def number(x):
    try:
        return float(x) if math.isfinite(float(x)) else None
    except (ValueError, TypeError):
        return None


def compare_analyses(analyses):
    if len({a.provenance.price_basis for a in analyses}) != 1:
        raise ValueError("Comparison requires matching adjustment conventions.")
    if any(a.provenance.price_basis in ["unknown", "unadjusted"] for a in analyses):
        raise ValueError("Clarify adjusted OHLC conventions before comparing returns.")
    if len({a.instrument.synthetic for a in analyses}) != 1:
        raise ValueError("Synthetic and real histories must be researched separately.")
    if any(a.assessment.data_quality.stale for a in analyses):
        raise ValueError("Refresh stale histories before comparing.")
    columns = [
        pd.Series({b["time"]: b["Close"] for b in a.bars}, name=a.instrument.symbol)
        for a in analyses
    ]
    aligned = pd.concat(columns, axis=1, join="inner").sort_index().dropna().tail(127)
    if len(aligned) < 2:
        raise ValueError("At least two shared completed sessions are required.")
    normalized = (aligned / aligned.iloc[0] - 1) * 100
    return dict(
        analyses=analyses,
        series=[dict(time=d, **r.to_dict()) for d, r in normalized.iterrows()],
        start=aligned.index[0],
        end=aligned.index[-1],
        price_basis=analyses[0].provenance.price_basis,
    )


def relative_returns(f, benchmark, symbol):
    if benchmark is None:
        return dict(
            status="unavailable",
            reason="Benchmark history unavailable. No relative-performance contribution.",
            benchmark=symbol,
            returns={},
            series=[],
        )
    aligned = (
        f[["Close"]]
        .join(benchmark[["Close"]].rename(columns={"Close": "Benchmark"}), how="inner")
        .dropna()
    )
    if aligned.empty:
        return dict(
            status="unavailable",
            reason="No matching sessions.",
            benchmark=symbol,
            returns={},
            series=[],
        )
    returns = {}
    for label, n in [("1 month", 21), ("3 months", 63), ("6 months", 126)]:
        if len(aligned) <= n:
            returns[label] = None
            continue
        s, b = aligned.iloc[-1], aligned.iloc[-n - 1]
        a = (s.Close / b.Close - 1) * 100
        m = (s.Benchmark / b.Benchmark - 1) * 100
        returns[label] = dict(
            stock=a,
            benchmark=m,
            excess=a - m,
            start=aligned.index[-n - 1].strftime("%Y-%m-%d"),
            end=aligned.index[-1].strftime("%Y-%m-%d"),
        )
    g = aligned.iloc[-127:]
    series = [
        dict(
            time=d.strftime("%Y-%m-%d"),
            stock=(r.Close / g.Close.iloc[0] - 1) * 100,
            benchmark=(r.Benchmark / g.Benchmark.iloc[0] - 1) * 100,
        )
        for d, r in g.iterrows()
    ]
    return dict(
        status="available",
        benchmark=symbol,
        returns=returns,
        series=series,
        meaning="Excess return is stock return minus benchmark return in percentage points. This is unrelated to RSI.",
    )


def analyze(
    instrument,
    f,
    quality,
    provenance,
    context,
    benchmark=None,
    benchmark_symbol="SPY",
    horizon="2–8 weeks",
    previous=None,
):
    if f.empty:
        raise ValueError("No valid completed candles remain after validation.")
    i = calculate(f)
    r = i.iloc[-1]
    idx = len(i) - 1
    signals = decision(i, idx)
    zones = causal_zones(i, idx)
    metrics = {
        k: number(r[k])
        for k in i.columns
        if k not in ["engulfing", "hammer", "shooting_star"]
    }
    metrics["daily_change"] = (
        (f.Close.iloc[-1] / f.Close.iloc[-2] - 1) * 100 if len(f) > 1 else None
    )
    weekly_frame = completed_weekly(f)
    weekly = dict(
        status="unavailable",
        trend="Unknown",
        last_bar=None,
        reason="At least 20 completed weeks required.",
    )
    if len(weekly_frame) >= 20:
        wc = weekly_frame.Close.to_numpy(dtype=float)
        ma = talib.SMA(wc, 20)
        weekly = dict(
            status="available",
            trend="Bullish" if wc[-1] > ma[-1] else "Bearish",
            last_bar=weekly_frame.index[-1].strftime("%Y-%m-%d"),
            close=float(wc[-1]),
            sma20=float(ma[-1]),
            meaning="Completed-week close versus 20-week SMA; broader context, not a separate traded strategy.",
        )
    rel = relative_returns(f, benchmark, benchmark_symbol)
    support = []
    oppose = []
    contributions = []

    def group(name, points, maximum, reason):
        contributions.append(
            dict(group=name, points=points, maximum=maximum, reason=reason)
        )

    if signals["trend"]:
        support.append(
            "Close is above SMA 50 and SMA 200, with a rising SMA 50. These belong to one trend group."
        )
        group("Trend", 30, 30, "Broad averages align and SMA 50 is rising.")
    elif finite(r.sma50, r.sma200) and r.Close < r.sma50 and r.Close < r.sma200:
        oppose.append(
            "Close is below both SMA 50 and SMA 200; the broad daily trend argues against a new long entry."
        )
        group("Trend", 0, 30, "Price is below both broad averages.")
    else:
        group(
            "Trend",
            10 if finite(r.sma200) and r.Close > r.sma200 else 0,
            30,
            "Moving averages give incomplete or mixed trend evidence.",
        )
    momentum = finite(r.rsi14, r.macd_hist) and 50 <= r.rsi14 <= 70 and r.macd_hist > 0
    group(
        "Momentum",
        20 if momentum else 0,
        20,
        "RSI 50–70 and positive MACD histogram."
        if momentum
        else "RSI and MACD do not jointly support measured positive momentum.",
    )
    if momentum:
        support.append(
            f"RSI is {r.rsi14:.1f} and the MACD histogram is positive; grouped momentum supports the idea."
        )
    else:
        oppose.append(
            "Momentum is mixed or extended. RSI extremes alone are not entry or exit signals."
        )
    volume = finite(r.volume_ratio) and r.volume_ratio >= 1.2
    group(
        "Participation",
        15 if volume else 0,
        15,
        "Volume exceeds 1.2× the prior 20-session average."
        if volume
        else "Volume has not confirmed at 1.2×, or is unavailable.",
    )
    (support if volume else oppose).append(
        f"Volume is {r.volume_ratio:.2f}× the preceding 20-session average."
        if finite(r.volume_ratio)
        else "Volume evidence is unavailable."
    )
    structure = signals["breakout"]
    group(
        "Structure",
        20 if structure else 0,
        20,
        "A confirmed 20-session breakout."
        if structure
        else "No complete breakout signal on the latest decision bar.",
    )
    if structure:
        support.append(
            f"Completed close is above the prior 20-session high of {r.high20:.2f}."
        )
    excess = rel.get("returns", {}).get("3 months")
    relative_good = bool(excess and excess["excess"] > 0)
    group(
        "Market-relative",
        15 if relative_good else 0,
        15,
        "Outperformed the selected benchmark over 63 aligned sessions."
        if relative_good
        else "No positive 3-month excess return, or comparison unavailable.",
    )
    if excess:
        (support if relative_good else oppose).append(
            f"3-month return differs from {benchmark_symbol} by {excess['excess']:+.1f} percentage points."
        )
    if finite(r.adx14):
        support.append(
            f"ADX is {r.adx14:.1f}: {'stronger' if r.adx14 >= 25 else 'weak'} trend strength, without indicating direction."
        ) if r.adx14 >= 25 else oppose.append(
            f"ADX is {r.adx14:.1f}; weak trend strength may make breakouts less reliable."
        )
    if (
        weekly["status"] == "available"
        and (weekly["trend"] == "Bullish") != signals["trend"]
    ):
        oppose.append(
            f"Daily and completed weekly context disagree; weekly context is {weekly['trend'].lower()}."
        )
    from compass.events import earnings_row
    earnings = earnings_row(instrument, context.get('earnings'),
        source='csv' if 'csv' in provenance['source'].lower() else 'yfinance')
    event = "Next earnings date unknown or unverified; an event-driven gap cannot be excluded."
    if earnings.status == 'estimated':
        label = earnings.date_start if earnings.date_start == earnings.date_end else f'{earnings.date_start} – {earnings.date_end}'
        event = f"Provider-estimated earnings date: {label}. Verify before considering an entry."
    elif earnings.status == 'not_applicable':
        event = 'Synthetic example: no company earnings.' if instrument.synthetic else 'Company earnings do not apply to this ETF.'
    scenario = None
    candidate = signals["crossover"] or signals["breakout"]
    interesting = signals["trend"]
    trigger = (
        float(r.Close) if candidate else float(r.high20) if finite(r.high20) else None
    )
    if (candidate or interesting) and trigger and finite(r.atr14, r.low20):
        entry = trigger
        entry_max = entry + 0.25 * float(r.atr14)
        lows = [z["low"] for z in zones if z["kind"] == "support" and z["high"] < entry]
        structural = max([float(r.low20)] + lows)
        stop = min(structural - 0.5 * float(r.atr14), entry - float(r.atr14))
        targets = [
            z["low"]
            for z in zones
            if z["kind"] == "resistance" and z["low"] > entry_max
        ]
        if finite(r.high55) and r.high55 > entry_max:
            targets.append(float(r.high55))
        targets = sorted(
            t for t in targets if (t - entry_max) / (entry_max - stop) >= 1.5
        )
        if targets and 0 < stop < entry < targets[0]:
            scenario = Scenario(
                entry=entry,
                entry_max=entry_max,
                stop=stop,
                target=targets[0],
                reward_risk=(targets[0] - entry_max) / (entry_max - stop),
                trigger="Completed daily confirmation, then reassess at the next open; skip if the opening price is outside this range.",
                basis="Entry reference to +0.25 ATR; invalidation below structural support by 0.5 ATR, at least 1 ATR away; nearest causal overhead zone offering ≥1.5 reward/risk at upper entry.",
            )
    label = "No clear edge"
    condition = (
        f"Watch for a completed close above {r.high20:.2f}, trend alignment and volume ≥1.2×."
        if finite(r.high20)
        else "Wait for enough completed history to define a 20-session range."
    )
    if finite(r.sma50, r.sma200) and r.Close < r.sma50 and r.Close < r.sma200:
        label = "Unfavorable setup"
        condition = f"Reassess after price recovers SMA 50 ({r.sma50:.2f}) and the broader trend improves."
    elif candidate or interesting:
        label = "Wait for confirmation"
        if candidate and scenario:
            label = "Buy setup worth considering"
            condition = f"Next-open price must be within {scenario.entry:.2f}–{scenario.entry_max:.2f}; below {scenario.stop:.2f} invalidates the idea."
        elif candidate:
            condition = "A rule signal exists, but no causal overhead target provides ≥1.5 reward/risk. Wait for defensible structure."
    if horizon in ("1–6 months", "6–12 months") and (
        weekly.get("trend") != "Bullish" or not signals["trend"]
    ):
        if label == "Buy setup worth considering":
            label = "Wait for confirmation"
        oppose.append(
            f"For {horizon} research, broad daily trend and bullish completed-week context are required; no monthly execution strategy is validated."
        )
    if not quality["actionable"]:
        label = "Insufficient or stale data"
        scenario = None
        condition = "Refresh or clarify the source and adjustment basis; resolve quality issues before evaluating an actionable idea."
    if scenario is None and quality["actionable"]:
        oppose.append(
            "No defensible conditional entry/stop/target combination is available from current causal structure."
        )
    summary = {
        "Buy setup worth considering": "A documented long rule has triggered and structure supports a conditional research scenario. Confirm the next opening price and event risk.",
        "Wait for confirmation": "The stock has interesting trend evidence, but the entry conditions or structural reward/risk are incomplete. Patience is a valid outcome.",
        "Unfavorable setup": "The broad daily trend argues against a new long entry. Watch for recovery before reconsidering.",
        "No clear edge": "The evidence is mixed. Neither fixed strategy currently provides a complete long signal with a defensible research scenario.",
        "Insufficient or stale data": "The available history cannot support an actionable assessment. Values are shown for inspection, with the limitations below.",
    }[label]
    assessment = Assessment(
        label=label,
        horizon=horizon,
        horizon_scope=HORIZON_SCOPES[horizon],
        rule_version=VERSION,
        timestamp=utcnow().isoformat(),
        price_basis=provenance["price_basis"],
        data_quality=quality,
        supporting=support
        or ["No strong supporting facts meet the implemented groups."],
        opposing=oppose,
        event_risk=event,
        next_condition=condition,
        summary=summary,
        score=sum(x["points"] for x in contributions) if quality["actionable"] else 0,
        contributions=contributions,
        scenario=scenario,
        strategy_signals=signals,
    )
    bars = []
    for d, row in i.iterrows():
        bars.append(
            dict(time=d.strftime("%Y-%m-%d"), **{k: number(v) for k, v in row.items()})
        )
    patterns = []
    for key, name in [
        ("engulfing", "Engulfing"),
        ("hammer", "Hammer"),
        ("shooting_star", "Shooting star"),
    ]:
        if r[key]:
            patterns.append(
                dict(
                    name=name,
                    direction="bullish observation"
                    if r[key] > 0
                    else "bearish observation",
                    context="TA-Lib detection on the latest completed candle. Needs trend, participation and structure; never triggers a recommendation alone.",
                )
            )
    changes = []
    if previous:
        p = previous["analysis"]
        pa = p["assessment"]
        compatible = (
            p["provenance"]["source"] == provenance["source"]
            and p["provenance"]["price_basis"] == provenance["price_basis"]
        )
        if not compatible:
            changes.append(
                "Source or adjustment convention changed since your saved snapshot; price-change comparison withheld."
            )
        elif pa["horizon"] != horizon:
            changes.append(
                "Research horizon changed since your saved snapshot; setup labels use different context requirements."
            )
        elif pa["label"] != label:
            changes.append(f"Setup changed from {pa['label']} to {label}.")
        old = p["metrics"].get("Close")
        old_session = p["provenance"].get("last_completed_bar")
        if compatible and old and old_session in f.index:
            restated = float(f.loc[old_session, "Close"])
            if abs(restated / old - 1) > 1e-6:
                changes.append(
                    "Historical prices were restated by corporate actions or provider revisions; comparison uses the current adjustment basis."
                )
            changes.append(
                f"Completed close changed {(float(r.Close) / restated - 1) * 100:+.2f}% since saved session {old_session}, on the current adjusted basis."
            )
        elif compatible and old:
            changes.append(
                "Saved session is outside the current history; comparable price change unavailable."
            )
        if not changes:
            changes = [
                "No material setup-label change since your previous saved snapshot."
            ]
    return Analysis(
        instrument=instrument,
        provenance=provenance,
        assessment=assessment,
        metrics=metrics,
        bars=bars,
        zones=zones,
        weekly=weekly,
        relative=rel,
        education=educational_metrics(metrics),
        patterns=patterns,
        context=context,
        changes=changes,
        benchmark=benchmark_symbol,
        engine=ENGINE,
        lessons=contextual_lessons(instrument.symbol, metrics),
        terms=TERMS,
    )
