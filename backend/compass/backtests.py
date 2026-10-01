"""Backtesting.py execution; no custom general backtest engine."""

import warnings
import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy
from compass.indicators import calculate
from compass.rules import decision, VERSION
from compass.analysis import number


def simulation_decisions(indicators):
    return [decision(indicators, i) for i in range(len(indicators))]


def strategy_class(kind, signals, first):
    class FixedLong(Strategy):
        def init(self):
            self.decision_log = {}

        def next(self):
            idx = len(self.data) - 1
            if idx < first:
                return
            s = signals[idx]
            self.decision_log[self.data.index[-1].strftime("%Y-%m-%d")] = s
            if kind == "baseline":
                if idx == first:
                    self.buy(size=0.95)
                return
            if self.position:
                if kind == "crossover" and s["cross_exit"]:
                    self.position.close()
                elif kind == "breakout" and s["trail"] is not None:
                    for trade in self.trades:
                        trade.sl = max(trade.sl or 0, s["trail"])
            elif s["crossover" if kind == "crossover" else "breakout"]:
                if kind == "breakout":
                    stop = s["trail"]
                    if stop and 0 < stop < self.data.Close[-1]:
                        self.buy(size=0.95, sl=stop)
                else:
                    self.buy(size=0.95)

    return FixedLong


def summarize(result, equity, initial):
    t = result["_trades"]
    n = len(t)
    final = float(equity.iloc[-1])
    total = (final / initial - 1) * 100
    years = (equity.index[-1] - equity.index[0]).days / 365.25
    dd = (equity / equity.cummax() - 1).min() * 100
    gains = float(t.PnL[t.PnL > 0].sum()) if n else 0
    losses = float(-t.PnL[t.PnL < 0].sum()) if n else 0
    # Engine exposure only counts closed trades. Include marked open positions
    # and exclude our single pre-decision frame from the denominator.
    full_index = result["_equity_curve"].index
    exposed = np.zeros(len(full_index), dtype=bool)
    for trade in t.itertuples():
        exposed[trade.EntryBar : trade.ExitBar + 1] = True
    for trade in result["_strategy"].trades:
        exposed[trade.entry_bar :] = True
    exposure = float(exposed[full_index.get_indexer(equity.index)].mean() * 100)
    return dict(
        total_return=total,
        cagr=((final / initial) ** (1 / years) - 1) * 100
        if years >= 1 and final > 0
        else None,
        max_drawdown=float(dd),
        trades=n,
        win_rate=float((t.PnL > 0).mean() * 100) if n else None,
        expectancy=float(t.PnL.mean()) if n else None,
        profit_factor=gains / losses if losses > 0 else None,
        exposure=exposure,
        open_positions=len(result["_strategy"].trades),
        equity_final=final,
    )


def run_backtest(frame, kind, commission=0.001, spread=0.001, cash=10000):
    if len(frame) < 220:
        raise ValueError(
            "At least 220 valid daily sessions required: 200 warm-up plus evaluable evidence."
        )
    ind = calculate(frame)
    signals = simulation_decisions(ind)
    first = max(200, len(frame) - 1260)
    # Supply one pre-decision bar; all indicators/signals remain precomputed causally.
    data = frame.iloc[first - 1 :][["Open", "High", "Low", "Close", "Volume"]].copy()
    local = signals[first - 1 :]

    def run(which):
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message=".*open trades.*")
            return Backtest(
                data,
                strategy_class(which, local, 1),
                cash=cash,
                commission=commission,
                spread=spread,
                margin=1,
                trade_on_close=False,
                exclusive_orders=True,
                finalize_trades=False,
            ).run()

    result = run(kind)
    baseline = run("baseline")
    # Common evaluable decision date; first possible fill is the following session.
    eq = result["_equity_curve"].Equity.iloc[1:]
    beq = baseline["_equity_curve"].Equity.iloc[1:]
    metrics = summarize(result, eq, cash)
    bm = summarize(baseline, beq, cash)
    curve = [
        dict(
            time=d.strftime("%Y-%m-%d"),
            strategy=float(eq.loc[d]),
            baseline=float(beq.loc[d]),
        )
        for d in eq.index
    ]

    def period(name, g):
        a = eq.loc[g]
        b = beq.loc[g]
        return dict(
            name=name,
            start=g[0].strftime("%Y-%m-%d"),
            end=g[-1].strftime("%Y-%m-%d"),
            sessions=len(g),
            strategy_return=(a.iloc[-1] / a.iloc[0] - 1) * 100,
            baseline_return=(b.iloc[-1] / b.iloc[0] - 1) * 100,
            meaning="Continuing portfolio; no reset or retuning at this boundary.",
        )

    split = max(1, int(len(eq) * 0.8))
    holdout = period("Recent 20% holdout — frozen parameters", eq.index[split:])
    periods = [
        period(f"Chronological period {n + 1}", g)
        for n, g in enumerate(np.array_split(eq.index[:split], 3))
        if len(g) > 1
    ]
    closed = result["_trades"]
    trades = [
        dict(
            entry_date=row.EntryTime.strftime("%Y-%m-%d"),
            exit_date=row.ExitTime.strftime("%Y-%m-%d"),
            entry=float(row.EntryPrice),
            exit=float(row.ExitPrice),
            shares=int(row.Size),
            net_pnl=float(row.PnL),
            return_pct=float(row.ReturnPct) * 100,
        )
        for _, row in closed.iterrows()
    ]
    return dict(
        strategy=kind,
        rule_version=VERSION,
        engine="Backtesting.py 0.6.6",
        metrics=metrics,
        baseline_metrics=bm,
        equity=curve,
        trades=trades,
        periods=periods,
        holdout=holdout,
        dates=dict(
            start=eq.index[0].strftime("%Y-%m-%d"),
            end=eq.index[-1].strftime("%Y-%m-%d"),
            sessions=len(eq),
            warmup=first,
        ),
        assumptions=dict(
            cash=cash,
            commission=commission,
            spread=spread,
            sizing="95% of available cash, whole shares, one long position, no leverage; baseline uses the same allocation.",
            execution="Completed daily close decision, next-session open execution. Commission charged on entry and exit. Spread is a one-sided entry price uplift, used as an approximation of round-trip spread/slippage.",
            stops="Breakout stop starts at signal close − 3 ATR; after each completed close, update to max(previous stop, close − 3 ATR). Updated stops first apply on the following bar. Opening gaps below stop fill at the open; intrabar touches fill at stop. No profit-target orders are used, so there is no stop/target ordering ambiguity in these templates.",
            end="Open positions are marked at the final completed close and excluded from closed-trade metrics. No forced last-close liquidation or hypothetical exit fee.",
            dividends="Adjusted OHLC research units; no additional dividend cash flows. Split-only CSV measures price returns excluding dividends. Adjusted-price simulations approximate economic returns, not historical executable dollar prices.",
        ),
        decision_log=result["_strategy"].decision_log,
        conclusion=(
            "Strategy did not beat the comparable buy-and-hold baseline after these costs."
            if metrics["total_return"] <= bm["total_return"]
            else "Strategy exceeded this baseline in this sample. This is historical evidence, not a prediction."
        ),
        evidence="Limited closed-trade sample; interpret cautiously."
        if metrics["trades"] < 20
        else "Fixed rules, no optimization. In-sample plus a separately reported continuing-portfolio holdout; not independent predictive validation.",
    )
