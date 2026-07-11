from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core import deps
from app.core.security import create_access_token, create_refresh_token
from app.core.settings import settings
from app.db import mongo
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
async def test_mongo_connect_disconnect_and_get_db(monkeypatch):
    database = object()
    client = SimpleNamespace(get_default_database=lambda: database, close=lambda: setattr(client, "closed", True))
    app = SimpleNamespace(state=SimpleNamespace())
    ensured = []
    monkeypatch.setattr(mongo, "AsyncIOMotorClient", lambda uri: client)
    monkeypatch.setattr(mongo, "ensure_all", lambda db: _record_async(ensured, db))
    await mongo.connect(app)
    assert app.state.db is database and ensured == [database]
    assert mongo.get_db(SimpleNamespace(app=app)) is database
    await mongo.disconnect(app)
    assert client.closed is True


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
async def test_health_reports_even_when_database_is_down():
    application = create_app()

    class BrokenDb:
        async def command(self, command):
            raise RuntimeError("offline")

    application.state.db = BrokenDb()
    health = next(route.endpoint for route in application.routes if route.path == "/health")
    assert await health() == {"status": "ok"}
