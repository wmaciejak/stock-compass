import numpy as np
import pytest
from test_core import prices
from compass.backtests import run_backtest, simulation_decisions
from compass.indicators import calculate
from compass.rules import decision
from compass.providers.base import ProviderError
from compass.providers.yahoo import bounded_fetch
from compass.persistence import Store


def test_zero_trades_and_same_canonical_rules():
    f = prices()
    f.loc[:, ["Open", "High", "Low", "Close"]] = 100.0
    a = run_backtest(f, "crossover", 0.001, 0.001, 10000)
    assert a["metrics"]["trades"] == 0
    assert a["metrics"]["win_rate"] is None
    assert a["metrics"]["profit_factor"] is None
    assert a["baseline_metrics"]["exposure"] > 90
    i = calculate(prices())
    assert simulation_decisions(i) == [decision(i, n) for n in range(len(i))]


def test_provider_bounded_retry_and_rate_limit():
    calls = []

    def fail():
        calls.append(1)
        raise RuntimeError("429 Too Many Requests")

    with pytest.raises(ProviderError) as e:
        bounded_fetch(fail, sleep=lambda _: None)
    assert len(calls) == 1
    assert e.value.code == "rate_limited"


def test_persistence_restart(tmp_path):
    path = tmp_path / "test.sqlite"
    a = Store(path)
    a.add_watch("TEST")
    a.note("TEST", "Observe resistance")
    a = Store(path)
    assert "TEST" in a.watchlist()
    assert a.note("TEST") == "Observe resistance"


def test_gap_stop_engine():
    from backtesting import Backtest, Strategy

    f = prices(6)
    f.loc[:, ["Open", "High", "Low", "Close"]] = 100.0
    f.iloc[3, f.columns.get_loc("Open")] = 85
    f.iloc[3, f.columns.get_loc("Low")] = 84
    f.iloc[3, f.columns.get_loc("Close")] = 86

    class Gap(Strategy):
        def init(self):
            pass

        def next(self):
            if len(self.data) == 2:
                self.buy(size=1, sl=95)

    result = Backtest(
        f, Gap, cash=10000, commission=0, spread=0, trade_on_close=False
    ).run()
    assert result["_trades"].ExitPrice.iloc[0] == 85
    assert result["_trades"].EntryBar.iloc[0] == 2


def test_actual_simulator_decision_dates_match_evaluator():
    f = prices(350)
    result = run_backtest(f, "breakout")
    ind = calculate(f)
    expected = {
        d.strftime("%Y-%m-%d"): decision(ind, n)
        for n, d in enumerate(ind.index)
        if n >= 200
    }
    assert result["decision_log"] == expected
