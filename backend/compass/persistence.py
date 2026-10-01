from pathlib import Path
from contextlib import contextmanager
import sqlite3
import json
from compass.normalization import utcnow


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS watch(symbol TEXT PRIMARY KEY, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT NOT NULL, retrieved_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS notes(symbol TEXT PRIMARY KEY,text TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL,thesis TEXT NOT NULL,outcome TEXT NOT NULL,analysis_id INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS ai_runs(id TEXT PRIMARY KEY, symbol TEXT NOT NULL, horizon TEXT NOT NULL, language TEXT NOT NULL, state TEXT NOT NULL, submission_hash TEXT NOT NULL, fingerprint TEXT, record TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_one_active ON ai_runs((1)) WHERE state IN ('preparing','running');
            CREATE TABLE IF NOT EXISTS ai_requests(client_request_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, submission_hash TEXT NOT NULL);
            """)
            if not c.execute("SELECT 1 FROM kv WHERE key='initialized'").fetchone():
                c.executemany(
                    "INSERT OR IGNORE INTO watch VALUES(?,?)",
                    [
                        (s, utcnow().isoformat())
                        for s in [
                            "MU",
                            "TSM",
                            "VST",
                            "LULU",
                            "DEMO_TREND",
                            "DEMO_VOLATILE",
                        ]
                    ],
                )
                c.execute("INSERT INTO kv VALUES('initialized','true')")

    @contextmanager
    def connection(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        finally:
            c.close()

    def get(self, key, default=None):
        with self.connection() as c:
            r = c.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(r["value"]) if r else default

    def set(self, key, value):
        with self.connection() as c:
            c.execute(
                "INSERT OR REPLACE INTO kv VALUES(?,?)",
                (key, json.dumps(value, allow_nan=False)),
            )

    def watchlist(self):
        with self.connection() as c:
            return [
                r["symbol"]
                for r in c.execute(
                    "SELECT symbol FROM watch ORDER BY created_at,symbol"
                )
            ]

    def add_watch(self, symbol):
        with self.connection() as c:
            c.execute(
                "INSERT OR IGNORE INTO watch VALUES(?,?)",
                (symbol, utcnow().isoformat()),
            )

    def remove_watch(self, symbol):
        with self.connection() as c:
            c.execute("DELETE FROM watch WHERE symbol=?", (symbol,))

    def cached(self, key):
        with self.connection() as c:
            r = c.execute("SELECT * FROM cache WHERE key=?", (key,)).fetchone()
        return json.loads(r["value"]) if r else None

    def cache(self, key, value):
        with self.connection() as c:
            c.execute(
                "INSERT OR REPLACE INTO cache VALUES(?,?,?)",
                (key, json.dumps(value, allow_nan=False), value["retrieved_at"]),
            )

    def cache_count(self):
        with self.connection() as c:
            return c.execute("SELECT count(*) FROM cache").fetchone()[0]

    def note(self, symbol, text=None):
        with self.connection() as c:
            if text is not None:
                c.execute("INSERT OR REPLACE INTO notes VALUES(?,?)", (symbol, text))
            r = c.execute("SELECT text FROM notes WHERE symbol=?", (symbol,)).fetchone()
        return r["text"] if r else ""

    def read_ai_snapshot(self, symbol, comparison_symbols):
        """Freeze all relevant research reads in one SQLite transaction."""
        with self.connection() as c:
            c.execute('BEGIN')
            kv = {r['key']: json.loads(r['value']) for r in c.execute('SELECT * FROM kv')}
            watch = [r['symbol'] for r in c.execute('SELECT symbol FROM watch ORDER BY created_at,symbol')]
            benchmark = 'DEMO_MARKET' if symbol.startswith('DEMO_') else kv.get('settings', {}).get('benchmark', 'SPY')
            symbols = {symbol, benchmark, *comparison_symbols, *(s for s in watch if s.startswith('DEMO_') == symbol.startswith('DEMO_'))}
            caches = {r['key']: json.loads(r['value']) for r in c.execute('SELECT * FROM cache') if r['key'].split(':')[1] in symbols}
            note = c.execute('SELECT text FROM notes WHERE symbol=?', (symbol,)).fetchone()
            journal = [dict(r) for r in c.execute('SELECT * FROM journal WHERE symbol=? ORDER BY id', (symbol,))]
            snapshots = [dict(id=r['id'],analysis=json.loads(r['value']),created_at=r['created_at']) for r in c.execute('SELECT * FROM snapshots WHERE symbol=? ORDER BY id', (symbol,))]
        return dict(symbol=symbol,kv=kv, caches=caches, watch=watch, note=note['text'] if note else '', journal=journal, snapshots=snapshots)

    def save_snapshot(self, symbol, value):
        with self.connection() as c:
            return c.execute(
                "INSERT INTO snapshots(symbol,value,created_at) VALUES(?,?,?)",
                (symbol, json.dumps(value, allow_nan=False), utcnow().isoformat()),
            ).lastrowid

    def latest_snapshot(self, symbol):
        with self.connection() as c:
            r = c.execute(
                "SELECT id,value,created_at FROM snapshots WHERE symbol=? ORDER BY id DESC LIMIT 1",
                (symbol,),
            ).fetchone()
        return (
            dict(
                id=r["id"], analysis=json.loads(r["value"]), created_at=r["created_at"]
            )
            if r
            else None
        )

    def snapshots(self, symbol):
        with self.connection() as c:
            return [
                dict(r)
                for r in c.execute(
                    "SELECT id,created_at FROM snapshots WHERE symbol=? ORDER BY id DESC",
                    (symbol,),
                )
            ]

    def journal(self):
        with self.connection() as c:
            return [
                dict(r) for r in c.execute("SELECT * FROM journal ORDER BY id DESC")
            ]

    def save_idea(self, value, id=None):
        now = utcnow().isoformat()
        with self.connection() as c:
            if id:
                c.execute(
                    "UPDATE journal SET thesis=?,outcome=?,updated_at=? WHERE id=?",
                    (value.thesis, value.outcome, now, id),
                )
                return id
            return c.execute(
                "INSERT INTO journal(symbol,thesis,outcome,analysis_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (
                    value.symbol,
                    value.thesis,
                    value.outcome,
                    value.analysis_id,
                    now,
                    now,
                ),
            ).lastrowid

    def ai_reserve(self, record):
        from compass.ai.models import AiError
        request_id=record['request']['client_request_id']
        with self.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            prior=c.execute('SELECT * FROM ai_requests WHERE client_request_id=?',(record['request']['client_request_id'],)).fetchone()
            if prior:
                if prior['submission_hash'] != record['submission_hash']:
                    raise AiError('request_conflict','This request ID has already been used with different inputs.')
                return json.loads(c.execute('SELECT record FROM ai_runs WHERE id=?',(prior['run_id'],)).fetchone()['record'])
            active=c.execute("SELECT * FROM ai_runs WHERE state IN ('preparing','running')").fetchone()
            if active:
                if active['submission_hash'] != record['submission_hash']:
                    raise AiError('ai_busy',f"AI is currently analyzing {active['symbol']}. Wait for that job to finish.")
                record=json.loads(active['record'])
                run_id=record['id']
            else:
                run_id=record['id']
                c.execute('INSERT INTO ai_runs VALUES(?,?,?,?,?,?,?,?,?)',(run_id,record['symbol'],record['horizon'],record['language'],record['state'],record['submission_hash'],None,json.dumps(record,allow_nan=False),record['created_at']))
            # Alias UUIDs for identical active submissions remain idempotent after completion.
            c.execute('INSERT INTO ai_requests VALUES(?,?,?)',(request_id,run_id,record['submission_hash']))
        return record

    def ai_record(self, run_id):
        with self.connection() as c:
            row=c.execute('SELECT record FROM ai_runs WHERE id=?',(run_id,)).fetchone()
        return json.loads(row['record']) if row else None

    def ai_request_run(self, client_request_id):
        with self.connection() as c:
            row=c.execute('SELECT run_id FROM ai_requests WHERE client_request_id=?',(str(client_request_id),)).fetchone()
        return row['run_id'] if row else None

    def ai_update(self, run_id, **fields):
        with self.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT record FROM ai_runs WHERE id=?',(run_id,)).fetchone()
            record=json.loads(row['record'])
            record.update(fields,updated_at=utcnow().isoformat())
            c.execute('UPDATE ai_runs SET state=?,fingerprint=?,record=? WHERE id=?',(record['state'],record.get('fingerprint'),json.dumps(record,allow_nan=False),run_id))

    def ai_claim(self, run_id):
        with self.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT record FROM ai_runs WHERE id=?',(run_id,)).fetchone()
            if not row: return False
            record=json.loads(row['record'])
            if record['state']!='preparing' or record.get('started_at'): return False
            record['started_at']=utcnow().isoformat()
            c.execute('UPDATE ai_runs SET record=? WHERE id=?',(json.dumps(record,allow_nan=False),run_id))
        return True

    def ai_find(self, *, fingerprint=None, symbol=None, horizon=None, language=None, active=False):
        query='SELECT record FROM ai_runs WHERE '
        args=[]
        if active:
            query+="state IN ('preparing','running')"
        else:
            query+="state='succeeded'"
            for key,value in [('fingerprint',fingerprint),('symbol',symbol),('horizon',horizon),('language',language)]:
                if value is not None:
                    query+=f' AND {key}=?'
                    args.append(value)
        with self.connection() as c:
            row=c.execute(query+' ORDER BY created_at DESC LIMIT 1',args).fetchone()
        return json.loads(row['record']) if row else None

    def ai_recover(self):
        with self.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            rows=c.execute("SELECT record FROM ai_runs WHERE state IN ('preparing','running')").fetchall()
            for row in rows:
                record=json.loads(row['record'])
                record.update(state='interrupted',updated_at=utcnow().isoformat(),error=dict(code='interrupted',message='The local service restarted. This job was not automatically resubmitted.'))
                c.execute('UPDATE ai_runs SET state=?,record=? WHERE id=?',('interrupted',json.dumps(record),record['id']))
        return len(rows)
