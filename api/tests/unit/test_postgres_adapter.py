from datetime import UTC, date, datetime
from types import ModuleType, SimpleNamespace

import pytest

from app.db import postgres
from app.db.contracts import DuplicateKeyError, RecordId, ReturnDocument


class FakeRow(dict):
    def __getitem__(self, key):
        return dict.__getitem__(self, key)


class FakePool:
    def __init__(self):
        self.rows = {}
        self.executed = []
        self.closed = False

    async def fetch(self, sql, *args):
        self.executed.append((sql, args))
        if "DISTINCT collection" in sql:
            return [FakeRow(collection=name) for name in sorted({collection for collection, _id in self.rows})]
        collection = args[0]
        return [FakeRow(doc=doc) for (row_collection, _id), doc in self.rows.items() if row_collection == collection]

    async def fetchval(self, sql):
        self.executed.append((sql, ()))
        return 1

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        if sql.lstrip().startswith("INSERT"):
            collection, doc_id, doc = args
            self.rows[(collection, doc_id)] = doc
        elif sql.lstrip().startswith("DELETE"):
            collection, doc_id = args
            self.rows.pop((collection, doc_id), None)

    async def close(self):
        self.closed = True


@pytest.fixture
def db():
    return postgres.PostgresDocumentDatabase(FakePool())


@pytest.mark.asyncio
async def test_collection_crud_query_sort_and_type_roundtrip(db):
    first_id = RecordId()
    second_id = RecordId()
    created_at = datetime.now(UTC)
    await db.users.insert_one(
        {
            "_id": first_id,
            "email": "first@example.com",
            "roles": ["user"],
            "profile": {"score": 2},
            "created_at": created_at,
        }
    )
    result = await db.users.insert_one(
        {
            "_id": second_id,
            "email": "second@example.com",
            "roles": ["user"],
            "profile": {"score": 5},
            "birthday": date(2026, 1, 2),
        }
    )

    assert result.inserted_id == second_id
    assert await db.command("ping") == {"ok": 1}
    assert await db.list_collection_names() == ["users"]
    assert await db.users.create_index("email") == ""
    assert await db.users.create_indexes([]) == []

    found = await db.users.find_one({"_id": first_id, "profile.score": 2})
    assert found["_id"] == first_id
    assert found["created_at"] == created_at
    assert found["roles"] == ["user"]
    found["roles"].append("admin")
    assert (await db.users.find_one({"_id": first_id}))["roles"] == ["user"]

    docs = await db.users.find({}).sort("profile.score", -1).to_list(1)
    assert [doc["_id"] for doc in docs] == [second_id]
    docs = await db.users.find({}).sort([("profile.score", 1)]).to_list(10)
    assert [doc["_id"] for doc in docs] == [first_id, second_id]
    assert await db.users.count_documents({"email": "missing@example.com"}) == 0

    assert await db.users.find_one({"missing": {"$exists": False}}) is not None
    assert await db.users.find_one({"email": {"$exists": False}}) is None
    assert (await db.users.find_one({"profile.score": {"$gt": 4}}))["_id"] == second_id
    assert await db.users.find_one({"profile.score": {"$gt": 10}}) is None
    assert await db.users.find_one({"email": "missing@example.com"}) is None
    with pytest.raises(NotImplementedError, match="Unsupported query operator"):
        await db.users.find_one({"profile.score": {"$lt": 4}})

    with pytest.raises(NotImplementedError, match="pong"):
        await db.command("pong")
    with pytest.raises(AttributeError):
        db.__getattr__("_private")


@pytest.mark.asyncio
async def test_updates_upserts_uniques_and_delete(db):
    original_id = RecordId()
    await db.users.insert_one({"_id": original_id, "email": "user@example.com", "roles": ["user"], "count": 1})

    result = await db.users.update_one(
        {"_id": original_id},
        {
            "$set": {"name": "User"},
            "$push": {"events": "created"},
            "$inc": {"count": 2},
            "$addToSet": {"roles": "admin"},
        },
    )
    assert result.matched_count == 1
    assert result.modified_count == 1
    updated = await db.users.find_one({"_id": original_id})
    assert updated["name"] == "User"
    assert updated["events"] == ["created"]
    assert updated["count"] == 3
    assert updated["roles"] == ["user", "admin"]

    unchanged = await db.users.update_one({"_id": original_id}, {})
    assert unchanged.matched_count == 1
    assert unchanged.modified_count == 0

    result = await db.users.update_one(
        {"email": "new@example.com", "ignored": {"$exists": False}},
        {"$setOnInsert": {"roles": []}},
        upsert=True,
    )
    assert isinstance(result.upserted_id, RecordId)
    assert await db.users.find_one({"email": "new@example.com", "roles": []})
    assert (await db.users.update_one({"email": "none@example.com"}, {}, upsert=False)).matched_count == 0

    result = await db.users.update_many({"roles": ["user", "admin"]}, {"$set": {"active": True}})
    assert result.matched_count == 1
    assert result.modified_count == 1
    result = await db.users.update_many({"active": True}, {})
    assert result.matched_count == 1
    assert result.modified_count == 0

    before = await db.users.find_one_and_update({"_id": original_id}, {"$set": {"active": False}})
    assert before["active"] is True
    after = await db.users.find_one_and_update(
        {"_id": original_id}, {"$set": {"active": True}}, return_document=ReturnDocument.AFTER
    )
    assert after["active"] is True
    assert await db.users.find_one_and_update({"email": "none@example.com"}, {"$set": {"active": True}}) is None

    with pytest.raises(DuplicateKeyError):
        await db.users.insert_one({"email": "user@example.com"})

    deleted = await db.users.delete_one({"_id": original_id})
    assert deleted.deleted_count == 1
    assert (await db.users.delete_one({"_id": original_id})).deleted_count == 0


@pytest.mark.asyncio
async def test_sparse_compound_unique_and_disconnect(db):
    payment_id = RecordId()
    await db.payments.insert_one({"_id": payment_id, "claim_token_hash": "one"})
    await db.payments.insert_one({"claim_token_hash": "two", "gateway": None, "external_id": None})
    await db.payments.update_one({"_id": payment_id}, {"$set": {"gateway": "mp", "external_id": "abc"}})
    with pytest.raises(DuplicateKeyError):
        await db.payments.insert_one({"claim_token_hash": "three", "gateway": "mp", "external_id": "abc"})

    app = SimpleNamespace(state=SimpleNamespace(pg_pool=db.pool))
    await postgres.disconnect(app)
    assert db.pool.closed is True
    await postgres.disconnect(SimpleNamespace(state=SimpleNamespace()))


@pytest.mark.asyncio
async def test_adapter_edges_and_private_helpers(db):
    with pytest.raises(TypeError, match="set"):
        postgres._to_json({"bad": {1, 2}})

    legacy_id = RecordId()
    assert postgres._restore_ids({"$oid": str(legacy_id)}) == legacy_id
    assert postgres._restore_ids({"$id": str(legacy_id)}) == legacy_id
    assert postgres._restore_ids({"$oid": "not-valid"}) == {"$oid": "not-valid"}
    assert postgres._restore_ids(str(legacy_id), "_id") == legacy_id
    assert postgres._restore_ids("plain") == "plain"

    doc = {}
    postgres._set_path(doc, "profile.score", 10)
    assert doc == {"profile": {"score": 10}}
    assert postgres._apply_update(doc, {"$push": {"items": "a"}, "$addToSet": {"tags": "x"}, "$inc": {"count": 1}})
    assert doc == {"profile": {"score": 10}, "items": ["a"], "tags": ["x"], "count": 1}
    assert postgres._apply_update(doc, {"$push": {"items": "b"}})
    assert doc["items"] == ["a", "b"]
    assert postgres._apply_update(doc, {"$addToSet": {"tags": "x"}}) is False
    assert postgres._apply_update(doc, {"$unset": {"profile.score": ""}})
    assert postgres._apply_update(doc, {"$unset": {"profile.missing": ""}}) is False
    assert postgres._apply_update(doc, {"$unset": {"missing.path": ""}}) is False
    assert postgres._apply_update(doc, {}) is False

    await db.users.insert_one({"email": "plain@example.com", "profile": {"score": 1}})
    assert await db.users.find({}).to_list(10)


@pytest.mark.asyncio
async def test_connect_imports_asyncpg_and_creates_schema(monkeypatch):
    pool = FakePool()
    module = ModuleType("asyncpg")

    async def create_pool(url, *, min_size, max_size):
        assert url.startswith("postgresql://")
        assert min_size == 1
        assert max_size > 0
        return pool

    module.create_pool = create_pool
    monkeypatch.setitem(__import__("sys").modules, "asyncpg", module)
    app = SimpleNamespace(state=SimpleNamespace())

    await postgres.connect(app)

    assert app.state.pg_pool is pool
    assert app.state.db.pool is pool
    assert "CREATE TABLE IF NOT EXISTS app_documents" in pool.executed[0][0]
