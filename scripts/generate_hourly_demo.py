"""Generate labeled synthetic hourly fixtures from fictional daily demo data only."""
from pathlib import Path
import numpy as np
import pandas as pd
import pandas_market_calendars as mcal

root=Path(__file__).resolve().parents[1]/'fixtures'
for symbol in ['DEMO_TREND','DEMO_RANGE','DEMO_VOLATILE','DEMO_MARKET']:
    daily=pd.read_csv(root/f'{symbol}.csv',index_col='Date',parse_dates=True).tail(45)
    calendar=mcal.get_calendar('NYSE').schedule(daily.index[0],daily.index[-1])
    rows=[]
    for day, bar in daily.iterrows():
        session=calendar.loc[day]
        starts=pd.date_range(session.market_open,session.market_close,freq='1h',inclusive='left')
        n=len(starts)
        closes=np.linspace(bar.Open,bar.Close,n+1)[1:]
        volume=int(bar.Volume)
        previous=bar.Open
        for j,(at,close) in enumerate(zip(starts,closes)):
            rows.append(dict(Datetime=at.isoformat(),Open=previous,High=bar.High if j==n//3 else max(previous,close),Low=bar.Low if j==2*n//3 else min(previous,close),Close=close,Volume=volume//n+(j<volume%n)))
            previous=close
    pd.DataFrame(rows).to_csv(root/f'{symbol}_1h.csv',index=False,float_format='%.8f')
