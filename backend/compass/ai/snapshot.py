from copy import deepcopy


class ResearchSnapshot:
    """In-memory read-only Store interface; no mutable provider operations."""
    def __init__(self, records):
        self.records = deepcopy(records)
        self.store = self

    @classmethod
    def from_records(cls, records):
        return cls(records)

    def get(self, key, default=None):
        return deepcopy(self.records['kv'].get(key, default))

    def cached(self, key):
        return deepcopy(self.records['caches'].get(key))

    def watchlist(self):
        return self.records['watch'][:]

    def latest_snapshot(self, symbol):
        rows = self.records['snapshots']
        return deepcopy(rows[-1]) if rows and rows[-1]['analysis']['instrument']['symbol'] == symbol else None

    def set(self, *args):
        raise RuntimeError('A research snapshot cannot be modified.')

    cache = set

    def note(self, symbol):
        return self.records['note']

    def journal(self):
        return deepcopy(self.records['journal'])
