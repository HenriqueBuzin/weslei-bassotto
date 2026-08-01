import os

os.environ.setdefault("API_BASE", "/api/v1")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/weslei_bassotto_test")
os.environ.setdefault("APP_ENV", "dev")
os.environ.setdefault("JWT_ALG", "HS256")
os.environ.setdefault("JWT_SECRET", "test-secret-with-at-least-thirty-two-characters")
os.environ.setdefault("ACCESS_TOKEN_EXPIRES_MINUTES", "30")
os.environ.setdefault("REFRESH_TOKEN_EXPIRES_SHORT_HOURS", "8")
os.environ.setdefault("REFRESH_TOKEN_EXPIRES_LONG_DAYS", "30")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", '["http://test"]')
os.environ.setdefault("SEED_ON_START", "false")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_PASSWORD", "admin-password")
os.environ.setdefault("COOKIE_DOMAIN", "")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("COOKIE_SAMESITE", "lax")
os.environ.setdefault("REFRESH_COOKIE_NAME", "rt")
os.environ.setdefault("REFRESH_COOKIE_PATH", "/api/v1/auth")

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from app.core.security import create_access_token, hash_password
from app.db.contracts import RecordId
from app.db.postgres import PostgresDocumentDatabase
from app.routers import ROUTERS
from tests.support import MemoryPool


def pytest_collection_modifyitems(items):
    for item in items:
        path = str(item.path).replace("\\", "/")
        if "/unit/" in path:
            item.add_marker(pytest.mark.unit)
        elif path.endswith("/integration/test_payment_flow.py"):
            item.add_marker(pytest.mark.integration)
        elif "/integration/" in path:
            item.add_marker(pytest.mark.api)
        elif "/smoke/" in path:
            item.add_marker(pytest.mark.smoke)


@pytest_asyncio.fixture
async def db():
    yield PostgresDocumentDatabase(MemoryPool())


@pytest_asyncio.fixture
async def app(db):
    application = FastAPI()
    application.state.db = db
    for router in ROUTERS:
        application.include_router(router, prefix="/api/v1")
    return application


@pytest_asyncio.fixture
async def client(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client


@pytest_asyncio.fixture
async def user_factory(db):
    async def create(email="user@example.com", password="secret123", roles=None):
        doc = {
            "_id": RecordId(),
            "email": email.lower(),
            "password_hash": hash_password(password),
            "roles": roles or ["user"],
        }
        await db.users.insert_one(doc)
        return doc

    return create


@pytest_asyncio.fixture
async def auth_headers():
    def build(user):
        return {"Authorization": f"Bearer {create_access_token(str(user['_id']), user.get('roles', []))}"}

    return build
