from datetime import UTC, datetime, timedelta

import pytest

from app.routers.auth import _token_hash


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
