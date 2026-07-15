import pytest

from app.db.indexes import ensure_all


@pytest.mark.asyncio
async def test_all_indexes_are_created(db):
    await ensure_all(db)
    expected = {
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
    }
    assert expected.issubset(set(await db.list_collection_names()))
