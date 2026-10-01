"""English educational copy only; calculation and rule logic live elsewhere."""

TA = "https://ta-lib.github.io/ta-lib-python/func_groups/"
HORIZON_SCOPES = {
    "1–2 weeks": "Short-term monitoring of completed daily signals, EMA 20, momentum, ATR and 20-session structure. The same fixed daily strategies apply; a 1–2 week holding period is not separately validated. Scenario targets have no promised completion date.",
    "2–8 weeks": "Completed daily setup decisions, 20/55-session structure, momentum, volume, ATR risk and completed weekly context. The fixed daily strategies are tested; a particular holding period or target date is not guaranteed.",
    "1–6 months": "Completed daily strategies with broad daily trend and bullish completed 20-week context required for an action label. Use 3/6-month benchmark returns. No separate monthly execution model or holding-period forecast is validated.",
    "6–12 months": "Longer-term technical research using the same daily strategies, SMA 200 and bullish completed 20-week context. Use available 6-month benchmark returns. No separate 6–12 month holding strategy or long-term price forecast is validated.",
}
EDUCATION = [
    (
        "sma20",
        "SMA 20",
        "Average close over 20 completed sessions.",
        "Short trend, grouped with the other moving averages.",
        "Several moving averages are correlated; they are not independent confirmations.",
        TA + "overlap_studies.html",
    ),
    (
        "sma50",
        "SMA 50",
        "Average close over 50 sessions.",
        "Medium trend and crossover reference.",
        "A crossover can arrive late and whipsaw in a sideways market.",
        TA + "overlap_studies.html",
    ),
    (
        "sma200",
        "SMA 200",
        "Average close over 200 sessions.",
        "Broad daily trend filter.",
        "Short histories cannot support a 200-session conclusion.",
        TA + "overlap_studies.html",
    ),
    (
        "ema20",
        "EMA 20",
        "A 20-session exponentially weighted average.",
        "More responsive supporting trend context.",
        "Responsiveness also makes an average noisier.",
        TA + "overlap_studies.html",
    ),
    (
        "slope50",
        "SMA 50 slope (%)",
        "Percentage change in SMA 50 over five sessions.",
        "Rising slope supports the trend group.",
        "A rising average does not promise a rising future price.",
        TA + "overlap_studies.html",
    ),
    (
        "adx14",
        "ADX 14",
        "Strength of directional movement, on a 0–100 scale.",
        "Above 25 is stronger trending context.",
        "ADX measures strength, not bullish or bearish direction.",
        TA + "momentum_indicators.html",
    ),
    (
        "rsi14",
        "RSI 14",
        "Momentum based on recent gains and losses, on a 0–100 scale.",
        "50–70 supports measured positive momentum.",
        "Low RSI alone is not a good entry; high RSI is not an automatic sell.",
        TA + "momentum_indicators.html",
    ),
    (
        "macd",
        "MACD 12/26",
        "Difference between fast and slow exponential averages.",
        "Momentum context, grouped with RSI.",
        "It can lag price and overlaps with moving-average evidence.",
        TA + "momentum_indicators.html",
    ),
    (
        "macd_signal",
        "MACD signal 9",
        "Smoothed MACD line.",
        "Reference for MACD direction.",
        "A crossing without trend or structure is weak evidence.",
        TA + "momentum_indicators.html",
    ),
    (
        "macd_hist",
        "MACD histogram",
        "MACD minus its signal line.",
        "Positive values support improving momentum.",
        "A shrinking positive value is not the same as negative momentum.",
        TA + "momentum_indicators.html",
    ),
    (
        "atr14",
        "ATR 14",
        "Average true range includes overnight gaps.",
        "Sets volatility-aware invalidation and trailing exits.",
        "ATR measures movement size, not direction, and cannot cap gap losses.",
        TA + "volatility_indicators.html",
    ),
    (
        "atr_pct",
        "ATR / close (%)",
        "ATR divided by the completed close.",
        "Makes volatility easier to compare between prices.",
        "Equal ATR percentages do not mean equal event risk.",
        TA + "volatility_indicators.html",
    ),
    (
        "bb_upper",
        "Bollinger upper",
        "20-session average plus two standard deviations.",
        "Volatility envelope for price context.",
        "Touching the upper band is not an automatic sell.",
        TA + "overlap_studies.html",
    ),
    (
        "bb_middle",
        "Bollinger middle",
        "20-session simple average.",
        "Center of the volatility envelope.",
        "It repeats SMA 20 and adds no independent confirmation.",
        TA + "overlap_studies.html",
    ),
    (
        "bb_lower",
        "Bollinger lower",
        "20-session average minus two standard deviations.",
        "Shows the lower volatility envelope.",
        "A lower-band touch can occur during a sustained decline.",
        TA + "overlap_studies.html",
    ),
    (
        "volume_ratio",
        "Relative volume",
        "Latest volume divided by the preceding 20-session average.",
        "Breakout rule needs at least 1.2× volume.",
        "The decision session must not be included in its own comparison average.",
        TA + "volume_indicators.html",
    ),
    (
        "obv",
        "OBV",
        "Cumulative signed volume based on closing direction.",
        "Supporting participation context only.",
        "The absolute number is arbitrary; missing volume breaks continuity.",
        TA + "volume_indicators.html",
    ),
    (
        "high20",
        "Prior 20-session high",
        "Highest high of 20 sessions before the decision bar.",
        "The breakout confirmation boundary.",
        "Including the current bar would make this breakout rule impossible.",
        TA + "math_operators.html",
    ),
    (
        "low20",
        "Prior 20-session low",
        "Lowest low before the decision bar.",
        "A structural reference for invalidation.",
        "A support reference is not a guaranteed floor.",
        TA + "math_operators.html",
    ),
    (
        "high55",
        "Prior 55-session high",
        "Highest high of 55 earlier sessions.",
        "Broader overhead structure.",
        "A historical high is not an analyst forecast.",
        TA + "math_operators.html",
    ),
    (
        "low55",
        "Prior 55-session low",
        "Lowest low of 55 earlier sessions.",
        "Broader downside structure.",
        "Levels can fail on gaps or major events.",
        TA + "math_operators.html",
    ),
]


def educational_metrics(metrics):
    return [
        dict(
            key=k,
            name=n,
            measures=m,
            reading=metrics.get(k),
            role=r,
            mistake=mistake,
            url=url,
        )
        for k, n, m, r, mistake, url in EDUCATION
    ]


TERMS = {
    "drawdown": "Loss from a previous equity peak to a later trough; it measures the path of losses, not just the final result.",
    "confirmation": "A completed-bar condition specified in advance. A promising chart becomes a signal only when this condition occurs.",
    "invalidation": "A price condition that contradicts the idea. A stop is an execution instruction; gaps can fill below that level.",
    "reward/risk": "Distance from entry to a structural target divided by distance from entry to invalidation. This is not a probability or guaranteed payoff.",
    "holdout": "The most recent 20% of evaluable sessions, reported separately using the same frozen rules. No parameter tuning is performed.",
    "expectancy": "Average net outcome of closed trades. A few trades are weak evidence and do not predict the next trade.",
}


def contextual_lessons(symbol, metrics):
    lessons = []
    rsi = metrics.get("rsi14")
    volume = metrics.get("volume_ratio")
    atr = metrics.get("atr_pct")
    if rsi is not None:
        meaning = (
            "A low reading may persist during a falling trend; it cannot establish a good entry by itself."
            if rsi < 50
            else "Positive momentum can persist. An elevated reading is not an automatic sell and still needs structure and risk checks."
        )
        lessons.append(
            dict(
                title="Momentum is one piece of the picture",
                text=f"{symbol} has RSI 14 of {rsi:.2f}. {meaning}",
                url=TA + "momentum_indicators.html",
            )
        )
    if volume is not None:
        meaning = (
            "Participation has not met the 1.2× breakout threshold. Wait for the documented price and volume conditions together."
            if volume < 1.2
            else "Participation exceeds the 1.2× threshold, but volume alone cannot confirm a breakout: price and trend must also meet the rules."
        )
        lessons.append(
            dict(
                title="Ask who is participating",
                text=f"Latest volume for {symbol} is {volume:.2f}× its preceding 20-session average. {meaning}",
                url=TA + "volume_indicators.html",
            )
        )
    if atr is not None:
        lessons.append(
            dict(
                title="Plan for movement, including gaps",
                text=f"{symbol} has ATR / price of {atr:.2f}%. ATR helps scale invalidation distance; it does not predict direction or contain an earnings gap. Unknown earnings means you still need to verify event risk.",
                url=TA + "volatility_indicators.html",
            )
        )
    return lessons
