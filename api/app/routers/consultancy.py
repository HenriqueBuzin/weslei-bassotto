from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.deps import get_current_user, role_required
from app.db.mongo import get_db
from app.domain.plans import contract_period, get_plan
from app.schemas.consultancy import (
    AnswersUpdateIn,
    QuestionIn,
    QuestionOut,
    QuestionPatch,
    RenewalIn,
    SubmissionIn,
    SubmissionOut,
    SubscriptionPatch,
)
from app.services.contracts import create_admin_event
from app.services.payments import get_claimed_approved_payment

router = APIRouter(prefix="/consultancy", tags=["consultancy"])


def now() -> datetime:
    return datetime.now(UTC)


def parse_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail="ID inválido")
    return ObjectId(value)


def question_out(doc: dict[str, Any]) -> QuestionOut:
    return QuestionOut(
        id=str(doc["_id"]),
        **{key: doc[key] for key in ("label", "created_at", "updated_at")},
        type=doc.get("type", "textarea"),
        options=doc.get("options", []),
        required=doc.get("required", True),
        active=doc.get("active", True),
        order=doc.get("order", 0),
    )


def submission_out(doc: dict[str, Any]) -> SubmissionOut:
    return SubmissionOut(
        id=str(doc["_id"]),
        customer=doc["customer"],
        plan=doc["plan"],
        status=doc.get("status", "pending_payment"),
        payment_reference=doc.get("payment_reference"),
        payment_gateway=doc.get("payment_gateway"),
        answers=doc.get("answers", []),
        answer_revisions=doc.get("answer_revisions", []),
        answers_changed_at=doc.get("answers_changed_at"),
        answers_seen_at=doc.get("answers_seen_at"),
        renewal_count=doc.get("renewal_count", 0),
        renewals=doc.get("renewals", []),
        recurrence_status=doc.get("recurrence_status"),
        recurrence_issue=doc.get("recurrence_issue"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def get_active_questions(db) -> list[dict[str, Any]]:
    return await db.consultancy_questions.find({"active": True}).sort([("order", 1), ("created_at", 1)]).to_list(200)


async def build_answer_snapshot(db, answers_data) -> list[dict[str, Any]]:
    questions = await get_active_questions(db)
    by_id = {str(question["_id"]): question for question in questions}
    values = {answer.question_id: answer.value for answer in answers_data}
    missing = [q["label"] for q in questions if q.get("required", True) and values.get(str(q["_id"])) in (None, "")]
    if missing:
        raise HTTPException(status_code=422, detail={"missing_questions": missing})
    return [
        {"question_id": qid, "label": by_id[qid]["label"], "type": by_id[qid].get("type", "textarea"), "value": value}
        for qid, value in values.items()
        if qid in by_id
    ]


async def find_owned_submission(db, submission_id: str, user: dict[str, Any]) -> dict[str, Any]:
    doc = await db.consultancy_submissions.find_one({"_id": parse_object_id(submission_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    if doc.get("customer", {}).get("email", "").lower() != user.get("email", "").lower():
        raise HTTPException(status_code=403, detail="Sem permissão para alterar esta anamnese")
    return doc


@router.get("/questions", response_model=list[QuestionOut])
async def list_public_questions(req: Request):
    return [question_out(q) for q in await get_active_questions(get_db(req))]


@router.post("/submissions", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def create_submission(req: Request, data: SubmissionIn, user=Depends(get_current_user)):
    db = get_db(req)
    payment = await get_claimed_approved_payment(db, data.payment_id, data.payment_token)
    if not payment:
        raise HTTPException(status_code=402, detail="Pagamento aprovado é obrigatório para responder à anamnese")
    if payment["plan_slug"] != data.plan_slug or payment.get("renewal_submission_id"):
        raise HTTPException(status_code=409, detail="O pagamento não corresponde a esta contratação")
    if payment.get("account_email", "").lower() != user["email"].lower():
        raise HTTPException(status_code=403, detail="Este pagamento pertence a outra conta")
    if str(data.customer.email).lower() != user["email"].lower():
        raise HTTPException(status_code=409, detail="Use o mesmo e-mail da sua conta nos dados do aluno")
    if payment.get("claimed_submission_id"):
        raise HTTPException(status_code=409, detail="Este pagamento já foi utilizado")

    answers = await build_answer_snapshot(db, data.answers)
    plan = get_plan(payment["plan_slug"])
    start_date, end_date = contract_period(plan.months)
    timestamp = now()
    doc = {
        "customer": {**data.customer.model_dump(), "email": str(data.customer.email).lower()},
        "plan": {
            "slug": plan.slug,
            "name": plan.name,
            "months": plan.months,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
        "status": "active",
        "payment_id": data.payment_id,
        "payment_reference": payment.get("external_id"),
        "payment_gateway": payment.get("gateway"),
        "answers": answers,
        "answer_revisions": [],
        "answers_changed_at": timestamp,
        "answers_seen_at": None,
        "renewal_count": 0,
        "renewals": [],
        "recurrence_status": payment["status"],
        "recurrence_issue": None,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    result = await db.consultancy_submissions.insert_one(doc)
    doc["_id"] = result.inserted_id
    claimed = await db.payments.update_one(
        {"_id": payment["_id"], "claimed_submission_id": {"$exists": False}},
        {"$set": {"claimed_submission_id": str(result.inserted_id), "updated_at": timestamp}},
    )
    if claimed.modified_count != 1:
        await db.consultancy_submissions.delete_one({"_id": result.inserted_id})
        raise HTTPException(status_code=409, detail="Este pagamento já foi utilizado")
    await create_admin_event(db, "new_contract", submission_id=result.inserted_id, payment_id=payment["_id"])
    return submission_out(doc)


@router.get("/me/submissions", response_model=list[SubmissionOut])
async def list_my_submissions(req: Request, user=Depends(get_current_user)):
    docs = (
        await get_db(req)
        .consultancy_submissions.find({"customer.email": user["email"].lower()})
        .sort("created_at", -1)
        .to_list(100)
    )
    return [submission_out(doc) for doc in docs]


@router.patch("/me/submissions/{submission_id}/answers", response_model=SubmissionOut)
async def update_my_answers(submission_id: str, req: Request, data: AnswersUpdateIn, user=Depends(get_current_user)):
    db = get_db(req)
    current = await find_owned_submission(db, submission_id, user)
    timestamp = now()
    answers = await build_answer_snapshot(db, data.answers)
    await db.consultancy_submissions.update_one(
        {"_id": current["_id"]},
        {
            "$set": {
                "answers": answers,
                "answers_changed_at": timestamp,
                "answers_seen_at": None,
                "updated_at": timestamp,
            },
            "$push": {
                "answer_revisions": {
                    "answers": current.get("answers", []),
                    "changed_at": timestamp,
                    "changed_by": "subscriber",
                }
            },
        },
    )
    await create_admin_event(db, "answers_changed", submission_id=current["_id"])
    return submission_out(await db.consultancy_submissions.find_one({"_id": current["_id"]}))


@router.post("/me/submissions/{submission_id}/renew", response_model=SubmissionOut)
async def deprecated_renewal(submission_id: str, req: Request, data: RenewalIn, user=Depends(get_current_user)):
    await find_owned_submission(get_db(req), submission_id, user)
    raise HTTPException(status_code=410, detail="Use o checkout de renovação; as datas são atualizadas pelo pagamento")


@router.get("/admin/questions", response_model=list[QuestionOut])
async def list_admin_questions(req: Request, _user=Depends(role_required("admin"))):
    docs = await get_db(req).consultancy_questions.find({}).sort([("order", 1), ("created_at", 1)]).to_list(200)
    return [question_out(doc) for doc in docs]


@router.post("/admin/questions", response_model=QuestionOut, status_code=201)
async def create_question(req: Request, data: QuestionIn, _user=Depends(role_required("admin"))):
    timestamp = now()
    doc = {**data.model_dump(), "created_at": timestamp, "updated_at": timestamp}
    result = await get_db(req).consultancy_questions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return question_out(doc)


@router.patch("/admin/questions/{question_id}", response_model=QuestionOut)
async def update_question(question_id: str, req: Request, data: QuestionPatch, _user=Depends(role_required("admin"))):
    db, oid = get_db(req), parse_object_id(question_id)
    patch = data.model_dump(exclude_unset=True)
    if patch:
        await db.consultancy_questions.update_one({"_id": oid}, {"$set": {**patch, "updated_at": now()}})
    doc = await db.consultancy_questions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    return question_out(doc)


@router.delete("/admin/questions/{question_id}", status_code=204)
async def delete_question(question_id: str, req: Request, _user=Depends(role_required("admin"))):
    if (await get_db(req).consultancy_questions.delete_one({"_id": parse_object_id(question_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")


@router.get("/admin/submissions", response_model=list[SubmissionOut])
async def list_submissions(req: Request, _user=Depends(role_required("admin"))):
    docs = await get_db(req).consultancy_submissions.find({}).sort("created_at", -1).to_list(500)
    return [submission_out(doc) for doc in docs]


@router.patch("/admin/submissions/{submission_id}", response_model=SubmissionOut)
async def update_submission(
    submission_id: str, req: Request, data: SubscriptionPatch, _user=Depends(role_required("admin"))
):
    db, oid = get_db(req), parse_object_id(submission_id)
    patch = data.model_dump(exclude_unset=True)
    update: dict[str, Any] = {"updated_at": now()}
    for key in ("status", "payment_reference"):
        if key in patch:
            update[key] = patch[key]
    for key in ("start_date", "end_date"):
        if key in patch:
            update[f"plan.{key}"] = patch[key].isoformat() if patch[key] else None
    await db.consultancy_submissions.update_one({"_id": oid}, {"$set": update})
    doc = await db.consultancy_submissions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    return submission_out(doc)


@router.post("/admin/submissions/{submission_id}/answers/seen", response_model=SubmissionOut)
async def mark_answers_seen(submission_id: str, req: Request, _user=Depends(role_required("admin"))):
    db, oid = get_db(req), parse_object_id(submission_id)
    await db.consultancy_submissions.update_one({"_id": oid}, {"$set": {"answers_seen_at": now(), "updated_at": now()}})
    doc = await db.consultancy_submissions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    await db.admin_events.update_many(
        {"submission_id": oid, "type": "answers_changed", "seen_at": None}, {"$set": {"seen_at": now()}}
    )
    return submission_out(doc)


@router.get("/admin/events")
async def list_admin_events(req: Request, _user=Depends(role_required("admin"))):
    docs = await get_db(req).admin_events.find({}).sort("created_at", -1).to_list(500)
    return [
        {
            **{key: value for key, value in doc.items() if key != "_id"},
            "id": str(doc["_id"]),
            "payment_id": str(doc.get("payment_id", "")),
            "submission_id": str(doc.get("submission_id", "")),
        }
        for doc in docs
    ]


@router.post("/admin/events/{event_id}/seen")
async def mark_admin_event_seen(event_id: str, req: Request, _user=Depends(role_required("admin"))):
    result = await get_db(req).admin_events.update_one({"_id": parse_object_id(event_id)}, {"$set": {"seen_at": now()}})
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    return {"ok": True}
