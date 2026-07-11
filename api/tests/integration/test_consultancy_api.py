from datetime import UTC, datetime

import pytest
from bson import ObjectId
from fastapi import HTTPException
from types import SimpleNamespace

from app.routers.consultancy import create_submission
from app.schemas.consultancy import SubmissionIn
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


@pytest.mark.asyncio
async def test_question_and_submission_edge_cases(client, db, user_factory, auth_headers):
    user = await user_factory()
    other = await user_factory("other@example.com")
    admin = await user_factory("admin@example.com", roles=["admin"])
    user_headers, other_headers, admin_headers = auth_headers(user), auth_headers(other), auth_headers(admin)
    question = await seed_question(db)
    assert (await client.get("/api/v1/consultancy/questions")).status_code == 200

    payment = await seed_payment(db, user)
    base = {"plan_slug": "semestral", "payment_id": str(payment["_id"]), "payment_token": "claim-secret",
            "customer": {"name": "Aluno", "email": user["email"], "phone": "54999990000"}, "answers": []}
    assert (await client.post("/api/v1/consultancy/submissions", json=base, headers=user_headers)).status_code == 409
    base["plan_slug"] = "trimestral"
    assert (await client.post("/api/v1/consultancy/submissions", json=base, headers=user_headers)).status_code == 422
    base["answers"] = [{"question_id": str(question["_id"]), "value": "Não"}]
    base["customer"]["email"] = other["email"]
    assert (await client.post("/api/v1/consultancy/submissions", json=base, headers=user_headers)).status_code == 409

    invalid = "/api/v1/consultancy/me/submissions/not-an-id/answers"
    assert (await client.patch(invalid, json={"answers": []}, headers=user_headers)).status_code == 400
    missing_id = ObjectId()
    assert (await client.patch(f"/api/v1/consultancy/me/submissions/{missing_id}/answers", json={"answers": []}, headers=user_headers)).status_code == 404

    submission = {"_id": ObjectId(), "customer": {"email": user["email"]},
                  "plan": {"slug": "trimestral", "name": "Plano", "months": 3, "start_date": "2026-01-01", "end_date": "2026-04-01"},
                  "status": "active", "answers": [], "created_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}
    await db.consultancy_submissions.insert_one(submission)
    assert (await client.patch(f"/api/v1/consultancy/me/submissions/{submission['_id']}/answers", json={"answers": []}, headers=other_headers)).status_code == 403
    assert (await client.post(f"/api/v1/consultancy/me/submissions/{submission['_id']}/renew", json={"plan_slug": "anual"}, headers=user_headers)).status_code == 410
    assert (await client.get("/api/v1/consultancy/me/submissions", headers=user_headers)).status_code == 200

    assert (await client.patch(f"/api/v1/consultancy/admin/questions/{ObjectId()}", json={}, headers=admin_headers)).status_code == 404
    assert (await client.delete(f"/api/v1/consultancy/admin/questions/{ObjectId()}", headers=admin_headers)).status_code == 404
    assert (await client.get("/api/v1/consultancy/admin/submissions", headers=admin_headers)).status_code == 200
    assert (await client.get("/api/v1/consultancy/admin/questions", headers=admin_headers)).status_code == 200
    updated = await client.patch(f"/api/v1/consultancy/admin/submissions/{submission['_id']}",
        json={"status": "finished", "payment_reference": "ref", "start_date": "2026-02-01", "end_date": None}, headers=admin_headers)
    assert updated.status_code == 200 and updated.json()["status"] == "finished"
    assert (await client.patch(f"/api/v1/consultancy/admin/submissions/{ObjectId()}", json={}, headers=admin_headers)).status_code == 404
    assert (await client.post(f"/api/v1/consultancy/admin/submissions/{submission['_id']}/answers/seen", headers=admin_headers)).status_code == 200
    assert (await client.post(f"/api/v1/consultancy/admin/submissions/{ObjectId()}/answers/seen", headers=admin_headers)).status_code == 404

    event = {"_id": ObjectId(), "type": "test", "seen_at": None, "created_at": datetime.now(UTC)}
    await db.admin_events.insert_one(event)
    assert (await client.get("/api/v1/consultancy/admin/events", headers=admin_headers)).status_code == 200
    assert (await client.post(f"/api/v1/consultancy/admin/events/{event['_id']}/seen", headers=admin_headers)).json() == {"ok": True}
    assert (await client.post(f"/api/v1/consultancy/admin/events/{ObjectId()}/seen", headers=admin_headers)).status_code == 404


@pytest.mark.asyncio
async def test_submission_detects_payment_claim_race(db, user_factory, monkeypatch):
    user = await user_factory()
    question = await seed_question(db)
    payment = await seed_payment(db, user)
    class Payments:
        async def update_one(self, *args, **kwargs):
            return SimpleNamespace(modified_count=0)
    proxy = SimpleNamespace(
        payments=Payments(), consultancy_questions=db.consultancy_questions,
        consultancy_submissions=db.consultancy_submissions, admin_events=db.admin_events,
    )
    monkeypatch.setattr("app.routers.consultancy.get_claimed_approved_payment", lambda *args: _payment_async(payment))
    data = SubmissionIn(**{
        "plan_slug": "trimestral", "payment_id": str(payment["_id"]), "payment_token": "claim-secret",
        "customer": {"name": "Aluno", "email": user["email"], "phone": "54999990000"},
        "answers": [{"question_id": str(question["_id"]), "value": "Não"}],
    })
    with pytest.raises(HTTPException) as error:
        await create_submission(SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=proxy))), data, user)
    assert error.value.status_code == 409
    assert await db.consultancy_submissions.count_documents({}) == 0


async def _payment_async(payment):
    return payment
