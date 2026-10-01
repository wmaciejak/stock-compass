"""One causal rule implementation used by current assessments and simulation."""

import math

VERSION = "compass-1.1.0"


def finite(*values):
    return all(math.isfinite(float(x)) for x in values)


def decision(f, i):
    empty = dict(
        crossover=False, cross_exit=False, breakout=False, trend=False, trail=None
    )
    if i < 1:
        return empty
    r, p = f.iloc[i], f.iloc[i - 1]
    if not finite(r.sma20, r.sma50, p.sma20, p.sma50):
        return empty
    trend = finite(r.sma200) and r.Close > r.sma50 > r.sma200 and r.slope50 > 0
    return dict(
        crossover=bool(p.sma20 <= p.sma50 and r.sma20 > r.sma50),
        cross_exit=bool(p.sma20 >= p.sma50 and r.sma20 < r.sma50),
        breakout=bool(
            trend
            and finite(r.high20, r.atr14, r.volume_ratio)
            and r.Close > r.high20
            and r.volume_ratio >= 1.2
        ),
        trend=bool(trend),
        trail=float(r.Close - 3 * r.atr14) if finite(r.atr14) else None,
    )


def causal_zones(f, i, time_format="%Y-%m-%d"):
    # A 2-left/2-right pivot becomes available only on pivot+2's close.
    start = max(2, i - 125)
    pivots = []
    for j in range(start, i - 1):
        w = f.iloc[j - 2 : j + 3]
        r = f.iloc[j]
        for kind, col, op in [("resistance", "High", max), ("support", "Low", min)]:
            values = w[col].tolist()
            if values[2] == op(values) and values.count(values[2]) == 1:
                pivots.append(
                    dict(
                        kind=kind,
                        price=float(r[col]),
                        pivot_date=f.index[j].strftime(time_format),
                        available_date=f.index[j + 2].strftime(time_format),
                    )
                )
    atr = float(f.atr14.iloc[i])
    width = atr * 0.3 if finite(atr) else float(f.Close.iloc[i]) * 0.005
    groups = []
    for p in pivots:
        zone_match = next(
            (
                z
                for z in groups
                if z["kind"] == p["kind"] and abs(z["price"] - p["price"]) <= width
            ),
            None,
        )
        if zone_match:
            zone_match["low"] = min(zone_match["low"], p["price"] - width / 2)
            zone_match["high"] = max(zone_match["high"], p["price"] + width / 2)
            zone_match["touches"] += 1
            zone_match["available_date"] = p["available_date"]
        else:
            groups.append(
                dict(
                    **p,
                    low=p["price"] - width / 2,
                    high=p["price"] + width / 2,
                    touches=1,
                )
            )
    close = float(f.Close.iloc[i])
    return sorted(groups, key=lambda z: abs(z["price"] - close))[:8]
