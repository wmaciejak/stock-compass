"""Separate real hourly smoke. Requires running local app and reachable yfinance."""
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError


def main():
    records=[]
    for symbol in ('MU','SPY'):
        try:
            with urlopen(f'http://127.0.0.1:8765/api/chart/{symbol}?interval=1h&refresh=true',timeout=105) as response:
                chart=json.load(response)
            assert not chart['synthetic']
            assert chart['interval']=='1h' and len(chart['bars'])>=200
            assert chart['bars'][-1]['ema20'] is not None
            assert not chart['quality']['stale']
            assert datetime.fromisoformat(chart['last_completed_end'])<=datetime.now(timezone.utc)
            records.append(dict(symbol=symbol,passed=True,bars=len(chart['bars']),engine=chart['engine'],source=chart['source'],price_basis=chart['price_basis'],retrieved_at=chart['retrieved_at'],last_completed_end=chart['last_completed_end'],exchange_timezone=chart['exchange_timezone'],quality=chart['quality']))
        except Exception as error:
            detail=error.read().decode() if isinstance(error,HTTPError) else str(error)
            records.append(dict(symbol=symbol,passed=False,error=detail))
    result=dict(checked_at=datetime.now(timezone.utc).isoformat(),results=records)
    (Path(__file__).resolve().parents[1]/'docs/live-hourly-smoke.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    return 0 if all(r['passed'] for r in records) else 1


if __name__=='__main__':
    raise SystemExit(main())
