from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import create_access_token, create_refresh_token, decode_token
from app.core.settings import settings
from app.routers.auth import _token_hash
from app.services.auth_sessions import issue_refresh_session, refresh_jti_hash
from app.services.email import send_reset_email


@pytest.mark.asyncio
async def test_register_login_refresh_and_logout(client, db):
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
    old_refresh = client.cookies.get(settings.refresh_cookie_name)

    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    new_refresh = client.cookies.get(settings.refresh_cookie_name)
    assert new_refresh != old_refresh
    old_session = await db.refresh_sessions.find_one({"jti_hash": refresh_jti_hash(decode_token(old_refresh)["jti"])})
    assert old_session["revoke_reason"] == "rotated"

    logout = await client.post("/api/v1/auth/logout")
    assert logout.status_code == 204
    new_session = await db.refresh_sessions.find_one({"jti_hash": refresh_jti_hash(decode_token(new_refresh)["jti"])})
    assert new_session["revoke_reason"] == "logout"


@pytest.mark.asyncio
@pytest.mark.regression
async def test_refresh_reuse_revokes_the_active_session_chain(client, db, user_factory):
    user = await user_factory()
    old_refresh = await issue_refresh_session(db, user["_id"], settings.REFRESH_TOKEN_EXPIRES_SHORT, False)
    client.cookies.set(settings.refresh_cookie_name, old_refresh, path=settings.refresh_cookie_path)
    rotation = await client.post("/api/v1/auth/refresh")
    assert rotation.status_code == 200
    active_refresh = rotation.cookies.get(settings.refresh_cookie_name)

    client.cookies.clear()
    client.cookies.set(settings.refresh_cookie_name, old_refresh)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.clear()
    client.cookies.set(settings.refresh_cookie_name, active_refresh)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    assert await db.refresh_sessions.count_documents({"user_id": user["_id"], "revoked_at": None}) == 0


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
    await issue_refresh_session(db, user["_id"], settings.REFRESH_TOKEN_EXPIRES_SHORT, False)
    token = "reset-token"
    await db.password_reset_tokens.insert_one(
        {
            "user_id": user["_id"],
            "token_hash": _token_hash(token),
            "used_at": None,
            "created_at": datetime.now(UTC),
            "expires_at": datetime.now(UTC) + timedelta(minutes=30),
        }
    )
    first = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "new-secret"})
    assert first.status_code == 200
    session = await db.refresh_sessions.find_one({"user_id": user["_id"]})
    assert session["revoke_reason"] == "password_reset"
    reused = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "another-secret"})
    assert reused.status_code == 400

    await db.password_reset_tokens.insert_one(
        {
            "user_id": user["_id"],
            "token_hash": _token_hash("expired"),
            "used_at": None,
            "created_at": datetime.now(UTC) - timedelta(hours=2),
            "expires_at": datetime.now(UTC) - timedelta(minutes=1),
        }
    )
    expired = await client.post("/api/v1/auth/reset-password", json={"token": "expired", "password": "new-secret"})
    assert expired.status_code == 400


@pytest.mark.asyncio
async def test_refresh_rejects_missing_invalid_access_and_unknown_user(client):
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set(settings.refresh_cookie_name, "invalid")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    client.cookies.set(settings.refresh_cookie_name, create_access_token("missing", []))
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    invalid_identity = create_refresh_token(
        "000000000000000000000000", settings.REFRESH_TOKEN_EXPIRES_SHORT, {"jti": ""}
    )
    client.cookies.set(settings.refresh_cookie_name, invalid_identity)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    missing = create_refresh_token("000000000000000000000000", settings.REFRESH_TOKEN_EXPIRES_SHORT)
    client.cookies.set(settings.refresh_cookie_name, missing)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_logout_ignores_invalid_refresh_cookie(client):
    client.cookies.set(settings.refresh_cookie_name, "invalid")
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    client.cookies.set(settings.refresh_cookie_name, create_access_token("missing", []))
    assert (await client.post("/api/v1/auth/logout")).status_code == 204


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

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def starttls(self):
            self.started_tls = True

        def login(self, *args):
            self.logged = args

        def send_message(self, message):
            self.message = message

    monkeypatch.setattr("app.services.email.smtplib.SMTP", SMTP)
    monkeypatch.setattr("app.services.email.smtplib.SMTP_SSL", SMTP)
    monkeypatch.setattr("app.services.email.settings.smtp_user", "sender@example.com")
    monkeypatch.setattr("app.services.email.settings.smtp_password", "password")
    monkeypatch.setattr("app.services.email.settings.smtp_from", "")
    monkeypatch.setattr("app.services.email.settings.smtp_use_ssl", False)
    monkeypatch.setattr("app.services.email.settings.smtp_use_tls", True)
    send_reset_email("user@example.com", "https://example.com/reset")
    assert sessions[-1].started_tls is True
    assert str(settings.password_reset_expires_minutes) in sessions[-1].message.get_content()
    monkeypatch.setattr("app.services.email.settings.smtp_use_ssl", True)
    send_reset_email("user@example.com", "https://example.com/reset")
    assert sessions[-1].started_tls is False


@pytest.mark.asyncio
async def test_reset_rejects_token_whose_user_was_removed(client, db):
    token = "orphan-token"
    await db.password_reset_tokens.insert_one(
        {
            "user_id": __import__("bson").ObjectId(),
            "token_hash": _token_hash(token),
            "used_at": None,
            "created_at": datetime.now(UTC),
            "expires_at": datetime.now(UTC) + timedelta(minutes=1),
        }
    )
    assert (
        await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "new-secret"})
    ).status_code == 400


@pytest.mark.asyncio
async def test_csrf_header_is_required_for_none_samesite(client, monkeypatch):
    monkeypatch.setattr("app.routers.auth.settings.cookie_samesite", "none")
    assert (await client.post("/api/v1/auth/logout")).status_code == 400
    assert (await client.post("/api/v1/auth/logout", headers={"x-requested-with": "XMLHttpRequest"})).status_code == 204
