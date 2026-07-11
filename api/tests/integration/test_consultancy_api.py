from datetime import UTC, datetime

import pytest
from bson import ObjectId

from app.services.payments import token_hash


async def seed_question(db, label="Possui alguma doença?", required=True):
    now = datetime.now(UTC)
    doc = {"_id": ObjectId(), "label": label, "type": "textarea", "options": [], "required": required,
           "active": True, "order": 1, "created_at": now, "updated_at": now}
    await db.consultancy_questions.insert_one(doc)
    return doc


async def seed_payment(db, user, secret="claim-secret", status="approved"):
    doc = {"_id": ObjectId(), "plan_slug": "trimestral", "status": status, "account_email": user["email"],
           "claim_token_hash": token_hash(secret), "gateway": "fake", "external_id": "charge-1",
           "created_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}
    await db.payments.insert_one(doc)
    return doc


@pytest.mark.asyncio
async def test_complete_submission_and_answer_revision_flow(client, db, user_factory, auth_headers):
    user = await user_factory()
    question = await seed_question(db)
    payment = await seed_payment(db, user)
    headers = auth_headers(user)
    payload = {
        "plan_slug": "trimestral", "payment_id": str(payment["_id"]), "payment_token": "claim-secret",
        "customer": {"name": "Aluno Teste", "email": user["email"], "phone": "(54) 99999-0000"},
        "answers": [{"question_id": str(question["_id"]), "value": "Não"}],
    }
    created = await client.post("/api/v1/consultancy/submissions", json=payload, headers=headers)
    assert created.status_code == 201
    submission = created.json()
    assert submission["status"] == "active"

    reused = await client.post("/api/v1/consultancy/submissions", json=payload, headers=headers)
    assert reused.status_code == 409

    changed = await client.patch(
        f"/api/v1/consultancy/me/submissions/{submission['id']}/answers",
        json={"answers": [{"question_id": str(question["_id"]), "value": "Hipertensão controlada"}]}, headers=headers,
    )
    assert changed.status_code == 200
    assert len(changed.json()["answer_revisions"]) == 1
    assert await db.admin_events.find_one({"type": "answers_changed"})


@pytest.mark.asyncio
async def test_submission_requires_approved_owned_payment(client, db, user_factory, auth_headers):
    owner = await user_factory("owner@example.com")
    other = await user_factory("other@example.com")
    question = await seed_question(db)
    payment = await seed_payment(db, owner, status="pending")
    payload = {
        "plan_slug": "trimestral", "payment_id": str(payment["_id"]), "payment_token": "claim-secret",
        "customer": {"name": "Outro Aluno", "email": other["email"], "phone": "54999990000"},
        "answers": [{"question_id": str(question["_id"]), "value": "Não"}],
    }
    pending = await client.post("/api/v1/consultancy/submissions", json=payload, headers=auth_headers(other))
    assert pending.status_code == 402

    await db.payments.update_one({"_id": payment["_id"]}, {"$set": {"status": "approved"}})
    forbidden = await client.post("/api/v1/consultancy/submissions", json=payload, headers=auth_headers(other))
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_admin_question_crud_and_permissions(client, user_factory, auth_headers):
    user = await user_factory()
    admin = await user_factory("admin@example.com", roles=["admin"])
    denied = await client.get("/api/v1/consultancy/admin/questions", headers=auth_headers(user))
    assert denied.status_code == 403

    created = await client.post(
        "/api/v1/consultancy/admin/questions",
        json={"label": "Quantas vezes treina?", "type": "number", "required": True, "active": True, "order": 2},
        headers=auth_headers(admin),
    )
    assert created.status_code == 201
    question_id = created.json()["id"]
    updated = await client.patch(
        f"/api/v1/consultancy/admin/questions/{question_id}", json={"label": "Quantos dias treina?"}, headers=auth_headers(admin)
    )
    assert updated.json()["label"] == "Quantos dias treina?"
    deleted = await client.delete(f"/api/v1/consultancy/admin/questions/{question_id}", headers=auth_headers(admin))
    assert deleted.status_code == 204
