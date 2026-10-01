import numpy as np
import pandas as pd
import talib

ENGINE = f"TA-Lib {talib.__version__}"


def calculate(frame):
    f = frame[["Open", "High", "Low", "Close", "Volume"]].copy()
    c, h, l, o, v = [
        f[k].to_numpy(dtype=float) for k in ["Close", "High", "Low", "Open", "Volume"]
    ]
    for n in [20, 50, 200]:
        f[f"sma{n}"] = talib.SMA(c, timeperiod=n)
    f["ema20"] = talib.EMA(c, timeperiod=20)
    f["slope50"] = f.sma50.diff(5) / f.sma50.shift(5) * 100
    f["adx14"] = talib.ADX(h, l, c, timeperiod=14)
    f["rsi14"] = talib.RSI(c, timeperiod=14)
    f["macd"], f["macd_signal"], f["macd_hist"] = talib.MACD(
        c, fastperiod=12, slowperiod=26, signalperiod=9
    )
    f["atr14"] = talib.ATR(h, l, c, timeperiod=14)
    f["atr_pct"] = f.atr14 / f.Close * 100
    f["bb_upper"], f["bb_middle"], f["bb_lower"] = talib.BBANDS(
        c, timeperiod=20, nbdevup=2, nbdevdn=2, matype=0
    )
    f["volume_ratio"] = f.Volume / f.Volume.shift(1).rolling(20, min_periods=20).mean()
    # TA-Lib propagates missing values; restart OBV only on contiguous valid segments.
    f["obv"] = np.nan
    valid = f.Volume.notna()
    for _, g in f[valid].groupby((~valid).cumsum()[valid]):
        f.loc[g.index, "obv"] = talib.OBV(
            g.Close.to_numpy(dtype=float), g.Volume.to_numpy(dtype=float)
        )
    for n in [20, 55]:
        f[f"high{n}"] = f.High.shift(1).rolling(n, min_periods=n).max()
        f[f"low{n}"] = f.Low.shift(1).rolling(n, min_periods=n).min()
    f["engulfing"] = talib.CDLENGULFING(o, h, l, c)
    f["hammer"] = talib.CDLHAMMER(o, h, l, c)
    f["shooting_star"] = talib.CDLSHOOTINGSTAR(o, h, l, c)
    return f
