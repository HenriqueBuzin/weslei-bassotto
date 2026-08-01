import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.security import create_refresh_token
from app.db.contracts import RecordId, ReturnDocument


def refresh_jti_hash(jti: str) -> str:
    return hashlib.sha256(jti.encode("utf-8")).hexdigest()


def refresh_identity(payload: dict[str, Any]) -> tuple[RecordId, str] | None:
    subject = payload.get("sub")
    jti = payload.get("jti")
    if not isinstance(subject, str) or not RecordId.is_valid(subject) or not isinstance(jti, str) or not jti:
        return None
    return RecordId(subject), refresh_jti_hash(jti)


async def issue_refresh_session(db, user_id: RecordId, expires_delta: timedelta, remember: bool) -> str:
    issued_at = datetime.now(UTC)
    jti = secrets.token_urlsafe(32)
    token = create_refresh_token(
        str(user_id),
        expires_delta=expires_delta,
        claims={"rm": 1 if remember else 0, "jti": jti},
    )
    await db.refresh_sessions.insert_one(
        {
            "user_id": user_id,
            "jti_hash": refresh_jti_hash(jti),
            "remember": remember,
            "created_at": issued_at,
            "expires_at": issued_at + expires_delta,
            "revoked_at": None,
            "revoke_reason": None,
            "replaced_by_hash": None,
        }
    )
    return token


async def rotate_refresh_session(db, payload: dict[str, Any], expires_delta: timedelta) -> str | None:
    identity = refresh_identity(payload)
    if not identity:
        return None
    user_id, current_hash = identity
    now = datetime.now(UTC)
    remember = bool(payload.get("rm", 0))
    next_jti = secrets.token_urlsafe(32)
    next_hash = refresh_jti_hash(next_jti)
    current = await db.refresh_sessions.find_one_and_update(
        {
            "user_id": user_id,
            "jti_hash": current_hash,
            "revoked_at": None,
            "expires_at": {"$gt": now},
        },
        {
            "$set": {
                "revoked_at": now,
                "revoke_reason": "rotated",
                "replaced_by_hash": next_hash,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not current:
        reused = await db.refresh_sessions.find_one({"user_id": user_id, "jti_hash": current_hash})
        if reused:
            await revoke_user_sessions(db, user_id, "reuse_detected")
        return None

    token = create_refresh_token(
        str(user_id),
        expires_delta=expires_delta,
        claims={"rm": 1 if remember else 0, "jti": next_jti},
    )
    await db.refresh_sessions.insert_one(
        {
            "user_id": user_id,
            "jti_hash": next_hash,
            "remember": remember,
            "created_at": now,
            "expires_at": now + expires_delta,
            "revoked_at": None,
            "revoke_reason": None,
            "replaced_by_hash": None,
        }
    )
    return token


async def revoke_refresh_session(db, payload: dict[str, Any], reason: str = "logout") -> bool:
    identity = refresh_identity(payload)
    if not identity:
        return False
    user_id, jti_hash = identity
    result = await db.refresh_sessions.update_one(
        {"user_id": user_id, "jti_hash": jti_hash, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(UTC), "revoke_reason": reason}},
    )
    return result.modified_count == 1


async def revoke_user_sessions(db, user_id: RecordId, reason: str) -> int:
    result = await db.refresh_sessions.update_many(
        {"user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(UTC), "revoke_reason": reason}},
    )
    return result.modified_count
