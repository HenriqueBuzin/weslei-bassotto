import pytest

from app.core.security import create_refresh_token, decode_token
from app.core.settings import settings
from app.db.contracts import RecordId
from app.services.auth_sessions import refresh_identity, revoke_refresh_session, rotate_refresh_session


def test_refresh_identity_rejects_invalid_payloads():
    assert refresh_identity({}) is None
    assert refresh_identity({"sub": "invalid", "jti": "token-id"}) is None
    assert refresh_identity({"sub": str(RecordId()), "jti": ""}) is None


@pytest.mark.asyncio
async def test_rotate_rejects_payload_without_refresh_identity(db):
    assert await rotate_refresh_session(db, {}, settings.REFRESH_TOKEN_EXPIRES_SHORT) is None


@pytest.mark.asyncio
async def test_rotate_rejects_unknown_refresh_session_without_reuse(db):
    token = create_refresh_token(str(RecordId()), settings.REFRESH_TOKEN_EXPIRES_SHORT)
    assert await rotate_refresh_session(db, decode_token(token), settings.REFRESH_TOKEN_EXPIRES_SHORT) is None


@pytest.mark.asyncio
async def test_revoke_rejects_payload_without_refresh_identity(db):
    assert await revoke_refresh_session(db, {}) is False
