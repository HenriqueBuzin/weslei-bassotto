from types import ModuleType, SimpleNamespace

import pytest
from fastapi import HTTPException
from jose import jwt

from app import db as db_module
from app.core import deps
from app.core.security import create_access_token, create_refresh_token
from app.core.settings import settings
from app.db import mongo, postgres
from app.main import create_app, lifespan


@pytest.mark.asyncio
async def test_current_user_rejects_invalid_token_types_and_unknown_users(db):
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    cases = [
        "invalid",
        create_refresh_token("missing", settings.REFRESH_TOKEN_EXPIRES_SHORT),
        jwt.encode({"type": "access"}, settings.jwt_secret, algorithm=settings.jwt_alg),
        create_access_token("not-an-object-id", ["user"]),
    ]
    for token in cases:
        with pytest.raises(HTTPException) as error:
            await deps.get_current_user(request, token)
        assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_role_dependency_allows_and_denies_roles():
    dependency = deps.role_required("admin")
    allowed = await dependency({"roles": ["admin"]})
    assert allowed["roles"] == ["admin"]
    with pytest.raises(HTTPException) as error:
        await dependency({"roles": ["user"]})
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_postgres_connect_disconnect_and_get_db(monkeypatch):
    executed = []

    class Pool:
        async def execute(self, sql):
            executed.append(sql)

        async def close(self):
            self.closed = True

    pool = Pool()
    app = SimpleNamespace(state=SimpleNamespace())
    fake_asyncpg = ModuleType("asyncpg")

    async def create_pool(*args, **kwargs):
        assert args and args[0].startswith("postgresql://")
        assert kwargs["min_size"] == 1
        return pool

    fake_asyncpg.create_pool = create_pool
    monkeypatch.setitem(__import__("sys").modules, "asyncpg", fake_asyncpg)

    await postgres.connect(app)
    assert app.state.pg_pool is pool
    assert app.state.db.pool is pool
    assert "CREATE TABLE IF NOT EXISTS app_documents" in executed[0]
    assert postgres.get_db(SimpleNamespace(app=app)) is app.state.db
    await postgres.disconnect(app)
    assert pool.closed is True


@pytest.mark.asyncio
async def test_mongo_connect_disconnect_and_get_db(monkeypatch):
    database = object()
    client = SimpleNamespace(get_default_database=lambda: database, close=lambda: setattr(client, "closed", True))
    ensured = []
    app = SimpleNamespace(state=SimpleNamespace())

    monkeypatch.setattr(mongo, "AsyncIOMotorClient", lambda uri: client)
    monkeypatch.setattr(mongo, "ensure_all", lambda db: _record_async(ensured, db))

    await mongo.connect(app)

    assert app.state.db is database
    assert ensured == [database]
    assert mongo.get_db(SimpleNamespace(app=app)) is database
    await mongo.disconnect(app)
    assert client.closed is True


@pytest.mark.asyncio
async def test_db_module_selects_configured_adapter(monkeypatch):
    events = []

    async def record_connect(app):
        events.append(("connect", app))

    async def record_disconnect(app):
        events.append(("disconnect", app))

    monkeypatch.setattr("app.db.postgres.connect", record_connect)
    monkeypatch.setattr("app.db.postgres.disconnect", record_disconnect)
    monkeypatch.setattr("app.db.postgres.get_db", lambda request: "postgres-db")
    monkeypatch.setattr(settings, "database_adapter", "postgres")

    app = SimpleNamespace(state=SimpleNamespace())
    request = SimpleNamespace(app=app)
    assert db_module.adapter() is postgres
    await db_module.connect(app)
    assert db_module.get_db(request) == "postgres-db"
    await db_module.disconnect(app)

    monkeypatch.setattr("app.db.mongo.get_db", lambda request: "mongo-db")
    monkeypatch.setattr(settings, "database_adapter", "mongo")
    assert db_module.adapter() is mongo
    assert db_module.get_db(request) == "mongo-db"
    assert [event[0] for event in events] == ["connect", "disconnect"]


async def _record_async(items, value):
    items.append(value)


@pytest.mark.asyncio
async def test_lifespan_connects_seeds_and_disconnects(monkeypatch):
    events = []
    app = SimpleNamespace(state=SimpleNamespace(db="database"))
    monkeypatch.setattr("app.main.connect", lambda target: _record_async(events, "connect"))
    monkeypatch.setattr("app.main.seed_all", lambda db: _record_async(events, "seed"))
    monkeypatch.setattr("app.main.disconnect", lambda target: _record_async(events, "disconnect"))
    monkeypatch.setattr("app.main.settings.seed_on_start", True)
    async with lifespan(app):
        events.append("inside")
    assert events == ["connect", "seed", "inside", "disconnect"]


@pytest.mark.asyncio
async def test_lifespan_skips_seed_when_disabled(monkeypatch):
    events = []
    app = SimpleNamespace(state=SimpleNamespace(db="database"))
    monkeypatch.setattr("app.main.connect", lambda target: _record_async(events, "connect"))
    monkeypatch.setattr("app.main.seed_all", lambda db: _record_async(events, "seed"))
    monkeypatch.setattr("app.main.disconnect", lambda target: _record_async(events, "disconnect"))
    monkeypatch.setattr("app.main.settings.seed_on_start", False)
    async with lifespan(app):
        pass
    assert events == ["connect", "disconnect"]


@pytest.mark.asyncio
async def test_health_reports_even_when_database_is_down():
    application = create_app()

    class BrokenDb:
        async def command(self, command):
            raise RuntimeError("offline")

    application.state.db = BrokenDb()
    health = next(route.endpoint for route in application.routes if getattr(route, "path", None) == "/health")
    assert await health() == {"status": "ok"}
