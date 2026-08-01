class MemoryRow(dict):
    def __getitem__(self, key):
        return dict.__getitem__(self, key)


class MemoryPool:
    def __init__(self):
        self.rows = {}
        self.executed = []
        self.closed = False

    async def fetch(self, sql, *args):
        self.executed.append((sql, args))
        if "DISTINCT collection" in sql:
            names = sorted({collection for collection, _record_id in self.rows})
            return [MemoryRow(collection=name) for name in names]
        collection = args[0]
        return [
            MemoryRow(doc=doc)
            for (row_collection, _record_id), doc in self.rows.items()
            if row_collection == collection
        ]

    async def fetchval(self, sql):
        self.executed.append((sql, ()))
        return 1

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        if sql.lstrip().startswith("INSERT"):
            collection, record_id, doc = args
            self.rows[(collection, record_id)] = doc
        elif sql.lstrip().startswith("DELETE"):
            collection, record_id = args
            self.rows.pop((collection, record_id), None)

    async def close(self):
        self.closed = True
