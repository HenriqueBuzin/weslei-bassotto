import copy
import json
from datetime import date, datetime
from types import SimpleNamespace
from typing import Any

from bson import ObjectId
from fastapi import Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.settings import settings

COLLECTIONS = (
    "users",
    "roles",
    "consultancy_questions",
    "consultancy_submissions",
    "password_reset_tokens",
    "payments",
    "payment_webhook_events",
    "contract_events",
    "admin_events",
    "login_security",
    "refresh_sessions",
)

UNIQUE_KEYS = {
    "users": (("email",),),
    "roles": (("name",),),
    "login_security": (("email",),),
    "refresh_sessions": (("jti_hash",),),
    "password_reset_tokens": (("token_hash",),),
    "payments": (("claim_token_hash",), ("gateway", "external_id")),
    "payment_webhook_events": (("gateway", "event_id"),),
    "contract_events": (("payment_id", "type"),),
}


def _json_default(value: Any) -> dict[str, str]:
    if isinstance(value, ObjectId):
        return {"$oid": str(value)}
    if isinstance(value, datetime):
        return {"$date": value.isoformat()}
    if isinstance(value, date):
        return {"$dateOnly": value.isoformat()}
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _to_json(value: dict[str, Any]) -> str:
    return json.dumps(value, default=_json_default, separators=(",", ":"))


def _restore_ids(value: Any, key: str | None = None) -> Any:
    if isinstance(value, list):
        return [_restore_ids(item, key) for item in value]
    if isinstance(value, dict):
        if set(value) == {"$oid"} and ObjectId.is_valid(value["$oid"]):
            return ObjectId(value["$oid"])
        if set(value) == {"$date"}:
            return datetime.fromisoformat(value["$date"].replace("Z", "+00:00"))
        if set(value) == {"$dateOnly"}:
            return date.fromisoformat(value["$dateOnly"])
        return {item_key: _restore_ids(item_value, item_key) for item_key, item_value in value.items()}
    return value


def _copy_doc(doc: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(doc)


def _get_path(doc: dict[str, Any], path: str) -> tuple[bool, Any]:
    current: Any = doc
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False, None
        current = current[part]
    return True, current


def _set_path(doc: dict[str, Any], path: str, value: Any) -> None:
    current = doc
    parts = path.split(".")
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def _matches_value(actual_exists: bool, actual: Any, expected: Any) -> bool:
    if isinstance(expected, dict):
        for operator, operand in expected.items():
            if operator == "$exists":
                if actual_exists != bool(operand):
                    return False
            elif operator == "$gt":
                if not actual_exists or actual <= operand:
                    return False
            else:
                raise NotImplementedError(f"Unsupported query operator: {operator}")
        return True
    return actual_exists and actual == expected


def _matches(doc: dict[str, Any], query: dict[str, Any] | None) -> bool:
    for key, expected in (query or {}).items():
        actual_exists, actual = _get_path(doc, key)
        if not _matches_value(actual_exists, actual, expected):
            return False
    return True


def _query_seed(query: dict[str, Any]) -> dict[str, Any]:
    doc: dict[str, Any] = {}
    for key, value in query.items():
        if not isinstance(value, dict):
            _set_path(doc, key, value)
    return doc


def _apply_update(doc: dict[str, Any], update: dict[str, Any], *, inserting: bool = False) -> bool:
    changed = False
    for key, value in update.get("$set", {}).items():
        _set_path(doc, key, value)
        changed = True
    if inserting:
        for key, value in update.get("$setOnInsert", {}).items():
            _set_path(doc, key, value)
            changed = True
    for key, value in update.get("$push", {}).items():
        exists, current = _get_path(doc, key)
        if not exists or current is None:
            current = []
            _set_path(doc, key, current)
        current.append(value)
        changed = True
    for key, value in update.get("$inc", {}).items():
        exists, current = _get_path(doc, key)
        _set_path(doc, key, (current if exists and current is not None else 0) + value)
        changed = True
    for key, value in update.get("$addToSet", {}).items():
        exists, current = _get_path(doc, key)
        if not exists or current is None:
            current = []
            _set_path(doc, key, current)
        if value not in current:
            current.append(value)
            changed = True
    return changed


def _present(values: list[Any]) -> bool:
    return all(value is not None for value in values)


class PostgresCursor:
    def __init__(self, docs: list[dict[str, Any]]):
        self._docs = docs

    def sort(self, key_or_list, direction: int | None = None):
        sort_keys = key_or_list if isinstance(key_or_list, list) else [(key_or_list, direction or 1)]
        for key, sort_direction in reversed(sort_keys):
            self._docs.sort(key=lambda doc: _get_path(doc, key)[1], reverse=sort_direction < 0)
        return self

    async def to_list(self, length: int | None = None) -> list[dict[str, Any]]:
        return [_copy_doc(doc) for doc in self._docs[:length]]


class PostgresCollection:
    def __init__(self, db: "PostgresDocumentDatabase", name: str):
        self._db = db
        self.name = name

    async def create_index(self, *_args, **_kwargs) -> str:
        return ""

    async def create_indexes(self, *_args, **_kwargs) -> list[str]:
        return []

    async def _all(self) -> list[dict[str, Any]]:
        rows = await self._db.pool.fetch(
            "SELECT doc FROM app_documents WHERE collection = $1 ORDER BY created_at ASC",
            self.name,
        )
        docs = []
        for row in rows:
            raw = row["doc"]
            docs.append(_restore_ids(json.loads(raw) if isinstance(raw, str) else dict(raw)))
        return docs

    async def _save(self, doc: dict[str, Any]) -> None:
        await self._check_unique(doc)
        await self._db.pool.execute(
            """
            INSERT INTO app_documents (collection, id, doc, updated_at)
            VALUES ($1, $2, $3::jsonb, now())
            ON CONFLICT (collection, id)
            DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()
            """,
            self.name,
            str(doc["_id"]),
            _to_json(doc),
        )

    async def _check_unique(self, doc: dict[str, Any]) -> None:
        for unique_key in UNIQUE_KEYS.get(self.name, ()):
            values = [_get_path(doc, key)[1] for key in unique_key]
            if not _present(values):
                continue
            for existing in await self._all():
                if existing["_id"] == doc["_id"]:
                    continue
                existing_values = [_get_path(existing, key)[1] for key in unique_key]
                if existing_values == values:
                    raise DuplicateKeyError(f"duplicate key on {self.name}: {', '.join(unique_key)}")

    async def insert_one(self, doc: dict[str, Any]):
        stored = _copy_doc(doc)
        inserted_id = stored.setdefault("_id", ObjectId())
        await self._save(stored)
        return SimpleNamespace(inserted_id=inserted_id)

    async def find_one(self, query: dict[str, Any] | None = None) -> dict[str, Any] | None:
        for doc in await self._all():
            if _matches(doc, query):
                return _copy_doc(doc)
        return None

    def find(self, query: dict[str, Any] | None = None) -> PostgresCursor:
        return PostgresCursorLoader(self, query)

    async def count_documents(self, query: dict[str, Any] | None = None) -> int:
        return len([doc for doc in await self._all() if _matches(doc, query)])

    async def update_one(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False):
        matched = 0
        modified = 0
        for doc in await self._all():
            if not _matches(doc, query):
                continue
            matched = 1
            if _apply_update(doc, update):
                await self._save(doc)
                modified = 1
            break
        upserted_id = None
        if matched == 0 and upsert:
            doc = _query_seed(query)
            doc.setdefault("_id", ObjectId())
            _apply_update(doc, update, inserting=True)
            await self._save(doc)
            upserted_id = doc["_id"]
        return SimpleNamespace(matched_count=matched, modified_count=modified, upserted_id=upserted_id)

    async def update_many(self, query: dict[str, Any], update: dict[str, Any]):
        matched = 0
        modified = 0
        for doc in await self._all():
            if not _matches(doc, query):
                continue
            matched += 1
            if _apply_update(doc, update):
                await self._save(doc)
                modified += 1
        return SimpleNamespace(matched_count=matched, modified_count=modified)

    async def delete_one(self, query: dict[str, Any]):
        for doc in await self._all():
            if not _matches(doc, query):
                continue
            await self._db.pool.execute(
                "DELETE FROM app_documents WHERE collection = $1 AND id = $2",
                self.name,
                str(doc["_id"]),
            )
            return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def find_one_and_update(self, query: dict[str, Any], update: dict[str, Any], return_document=None):
        for doc in await self._all():
            if not _matches(doc, query):
                continue
            before = _copy_doc(doc)
            _apply_update(doc, update)
            await self._save(doc)
            return _copy_doc(doc if return_document == ReturnDocument.AFTER else before)
        return None


class PostgresCursorLoader(PostgresCursor):
    def __init__(self, collection: PostgresCollection, query: dict[str, Any] | None):
        self._collection = collection
        self._query = query
        self._sort_keys = []

    def sort(self, key_or_list, direction: int | None = None):
        self._sort_keys = key_or_list if isinstance(key_or_list, list) else [(key_or_list, direction or 1)]
        return self

    async def to_list(self, length: int | None = None) -> list[dict[str, Any]]:
        docs = [doc for doc in await self._collection._all() if _matches(doc, self._query)]
        cursor = PostgresCursor(docs)
        if self._sort_keys:
            cursor.sort(self._sort_keys)
        return await cursor.to_list(length)


class PostgresDocumentDatabase:
    def __init__(self, pool):
        self.pool = pool

    def __getattr__(self, name: str) -> PostgresCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        return PostgresCollection(self, name)

    async def command(self, command: str) -> dict[str, int]:
        if command != "ping":
            raise NotImplementedError(command)
        await self.pool.fetchval("SELECT 1")
        return {"ok": 1}

    async def list_collection_names(self) -> list[str]:
        rows = await self.pool.fetch("SELECT DISTINCT collection FROM app_documents ORDER BY collection")
        return [row["collection"] for row in rows]


async def connect(app) -> None:
    import asyncpg

    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=settings.database_pool_size)
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS app_documents (
            collection text NOT NULL,
            id text NOT NULL,
            doc jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (collection, id)
        )
        """)
    app.state.pg_pool = pool
    app.state.db = PostgresDocumentDatabase(pool)


async def disconnect(app) -> None:
    pool = getattr(app.state, "pg_pool", None)
    if pool:
        await pool.close()


def get_db(req: Request):
    return req.app.state.db
