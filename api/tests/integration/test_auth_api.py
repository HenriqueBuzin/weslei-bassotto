from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.core.security import create_access_token, create_refresh_token
from app.core.settings import settings
from app.routers.auth import _send_reset_email, _token_hash


@pytest.mark.asyncio
async def test_register_login_refresh_and_logout(client):
    registered = await client.post("/api/v1/auth/register", json={"email": "New@Example.com", "password": "secret123"})
    assert registered.status_code == 201
    assert registered.json()["email"] == "new@example.com"

    duplicate = await client.post("/api/v1/auth/register", json={"email": "new@example.com", "password": "secret123"})
    assert duplicate.status_code == 400

    login = await client.post(
        "/api/v1/auth/login",
        data={"username": "new@example.com", "password": "secret123", "remember": "true"},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]
    assert "rt=" in login.headers["set-cookie"]

    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]

    logout = await client.post("/api/v1/auth/logout")
    assert logout.status_code == 204


@pytest.mark.asyncio
async def test_login_is_temporarily_locked_after_repeated_failures(client, user_factory):
    await user_factory()
    for _ in range(5):
        response = await client.post("/api/v1/auth/login", data={"username": "user@example.com", "password": "wrong"})
        assert response.status_code == 401
    blocked = await client.post("/api/v1/auth/login", data={"username": "user@example.com", "password": "secret123"})
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_password_reset_is_single_use_and_expires(client, db, user_factory):
    user = await user_factory()
    token = "reset-token"
    await db.password_reset_tokens.insert_one({
        "user_id": user["_id"], "token_hash": _token_hash(token), "used_at": None,
        "created_at": datetime.now(UTC), "expires_at": datetime.now(UTC) + timedelta(minutes=30),
    })
    first = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "new-secret"})
    assert first.status_code == 200
    reused = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "another-secret"})
    assert reused.status_code == 400

    await db.password_reset_tokens.insert_one({
        "user_id": user["_id"], "token_hash": _token_hash("expired"), "used_at": None,
        "created_at": datetime.now(UTC) - timedelta(hours=2), "expires_at": datetime.now(UTC) - timedelta(minutes=1),
    })
    expired = await client.post("/api/v1/auth/reset-password", json={"token": "expired", "password": "new-secret"})
    assert expired.status_code == 400


@pytest.mark.asyncio
async def test_refresh_rejects_missing_invalid_access_and_unknown_user(client):
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set(settings.refresh_cookie_name, "invalid")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set(settings.refresh_cookie_name, create_access_token("missing", []))
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    missing = create_refresh_token("000000000000000000000000", settings.REFRESH_TOKEN_EXPIRES_SHORT)
    client.cookies.set(settings.refresh_cookie_name, missing)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_forgot_password_hides_unknown_user_and_returns_dev_link(client, user_factory, monkeypatch):
    unknown = await client.post("/api/v1/auth/forgot-password", json={"email": "unknown@example.com"})
    assert unknown.json() == {"ok": True, "email_sent": False, "reset_url": None}
    await user_factory()
    monkeypatch.setattr("app.routers.auth.settings.smtp_password", "")
    response = await client.post("/api/v1/auth/forgot-password", json={"email": "USER@example.com"})
    assert response.status_code == 200
    assert response.json()["reset_url"].startswith(settings.frontend_public_url)


@pytest.mark.asyncio
async def test_forgot_password_sends_email_when_smtp_is_configured(client, user_factory, monkeypatch):
    await user_factory()
    sent = []
    monkeypatch.setattr("app.routers.auth.settings.smtp_user", "sender@example.com")
    monkeypatch.setattr("app.routers.auth.settings.smtp_password", "app-password")
    monkeypatch.setattr("app.routers.auth.asyncio.to_thread", lambda fn, *args: _capture_async(sent, args))
    response = await client.post("/api/v1/auth/forgot-password", json={"email": "user@example.com"})
    assert response.json()["email_sent"] is True
    assert sent[0][0] == "user@example.com"


async def _capture_async(items, value):
    items.append(value)


def test_email_sender_supports_tls_and_ssl(monkeypatch):
    sessions = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            self.started_tls = False
            sessions.append(self)
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def starttls(self): self.started_tls = True
        def login(self, *args): self.logged = args
        def send_message(self, message): self.message = message

    monkeypatch.setattr("app.routers.auth.smtplib.SMTP", SMTP)
    monkeypatch.setattr("app.routers.auth.smtplib.SMTP_SSL", SMTP)
    monkeypatch.setattr("app.routers.auth.settings.smtp_user", "sender@example.com")
    monkeypatch.setattr("app.routers.auth.settings.smtp_password", "password")
    monkeypatch.setattr("app.routers.auth.settings.smtp_from", "")
    monkeypatch.setattr("app.routers.auth.settings.smtp_use_ssl", False)
    monkeypatch.setattr("app.routers.auth.settings.smtp_use_tls", True)
    _send_reset_email("user@example.com", "https://example.com/reset")
    assert sessions[-1].started_tls is True
    assert str(settings.password_reset_expires_minutes) in sessions[-1].message.get_content()
    monkeypatch.setattr("app.routers.auth.settings.smtp_use_ssl", True)
    _send_reset_email("user@example.com", "https://example.com/reset")
    assert sessions[-1].started_tls is False


@pytest.mark.asyncio
async def test_reset_rejects_token_whose_user_was_removed(client, db):
    token = "orphan-token"
    await db.password_reset_tokens.insert_one({
        "user_id": __import__("bson").ObjectId(), "token_hash": _token_hash(token), "used_at": None,
        "created_at": datetime.now(UTC), "expires_at": datetime.now(UTC) + timedelta(minutes=1),
    })
    assert (await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "new-secret"})).status_code == 400
