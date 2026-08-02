import json
from types import SimpleNamespace
from typing import Any

from fastapi import Request

from app.core.settings import settings
from app.db.contracts import DuplicateKeyError, RecordId, ReturnDocument
from app.db.document_ops import apply_update as _apply_update
from app.db.document_ops import copy_doc as _copy_doc
from app.db.document_ops import get_path as _get_path
from app.db.document_ops import matches as _matches
from app.db.document_ops import present as _present
from app.db.document_ops import query_seed as _query_seed
from app.db.document_ops import restore_types as _restore_ids
from app.db.document_ops import to_json as _to_json

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
        inserted_id = stored.setdefault("_id", RecordId())
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
            doc.setdefault("_id", RecordId())
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
