from datetime import UTC, date, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.deps import get_current_user, role_required
from app.db.mongo import get_db
from app.schemas.consultancy import (
    QuestionIn,
    QuestionOut,
    QuestionPatch,
    AnswersUpdateIn,
    RenewalIn,
    SubmissionIn,
    SubmissionOut,
    SubscriptionPatch,
)

router = APIRouter(prefix="/consultancy", tags=["consultancy"])

PLANS = {
    "trimestral": {"name": "Plano Trimestral", "months": 3},
    "semestral": {"name": "Plano Semestral", "months": 6},
    "anual": {"name": "Plano Anual", "months": 12},
}


def now() -> datetime:
    return datetime.now(UTC)


def parse_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail="ID inválido")
    return ObjectId(value)


def add_months(source: date, months: int) -> date:
    month = source.month - 1 + months
    year = source.year + month // 12
    month = month % 12 + 1
    days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return source.replace(year=year, month=month, day=min(source.day, days_in_month[month - 1]))


def question_out(doc: dict[str, Any]) -> QuestionOut:
    return QuestionOut(
        id=str(doc["_id"]),
        label=doc["label"],
        type=doc.get("type", "textarea"),
        options=doc.get("options", []),
        required=doc.get("required", True),
        active=doc.get("active", True),
        order=doc.get("order", 0),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def submission_out(doc: dict[str, Any]) -> SubmissionOut:
    return SubmissionOut(
        id=str(doc["_id"]),
        customer=doc["customer"],
        plan=doc["plan"],
        status=doc.get("status", "pending_payment"),
        payment_reference=doc.get("payment_reference"),
        answers=doc.get("answers", []),
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
    questions_by_id = {str(q["_id"]): q for q in questions}
    answers_by_question = {answer.question_id: answer.value for answer in answers_data}

    missing = [
        q["label"]
        for q in questions
        if q.get("required", True)
        and (str(q["_id"]) not in answers_by_question or answers_by_question[str(q["_id"])] in (None, ""))
    ]
    if missing:
        raise HTTPException(status_code=422, detail={"missing_questions": missing})

    answers = []
    for question_id, value in answers_by_question.items():
        question = questions_by_id.get(question_id)
        if not question:
            continue
        answers.append(
            {
                "question_id": question_id,
                "label": question["label"],
                "type": question.get("type", "textarea"),
                "value": value,
            }
        )
    return answers


async def find_owned_submission(db, submission_id: str, user: dict[str, Any]) -> dict[str, Any]:
    doc = await db.consultancy_submissions.find_one({"_id": parse_object_id(submission_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Resposta não encontrada")
    if doc.get("customer", {}).get("email", "").lower() != user.get("email", "").lower():
        raise HTTPException(status_code=403, detail="Sem permissão para alterar esta anamnese")
    return doc


@router.get("/questions", response_model=list[QuestionOut])
async def list_public_questions(req: Request):
    db = get_db(req)
    questions = await get_active_questions(db)
    return [question_out(q) for q in questions]


@router.post("/submissions", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def create_submission(req: Request, data: SubmissionIn):
    if not data.payment_reference:
        raise HTTPException(
            status_code=402,
            detail="Pagamento confirmado é obrigatório para responder a anamnese",
        )

    db = get_db(req)
    answers = await build_answer_snapshot(db, data.answers)

    plan_base = PLANS[data.plan_slug]
    start_date = date.today()
    end_date = add_months(start_date, plan_base["months"])
    timestamp = now()
    doc = {
        "customer": data.customer.model_dump(),
        "plan": {
            "slug": data.plan_slug,
            "name": plan_base["name"],
            "months": plan_base["months"],
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
        "status": "paid" if data.payment_reference else "pending_payment",
        "payment_reference": data.payment_reference,
        "answers": answers,
        "answers_changed_at": timestamp,
        "answers_seen_at": None,
        "renewal_count": 0,
        "renewals": [],
        "recurrence_status": "active",
        "recurrence_issue": None,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    res = await db.consultancy_submissions.insert_one(doc)
    doc["_id"] = res.inserted_id
    return submission_out(doc)


@router.get("/me/submissions", response_model=list[SubmissionOut])
async def list_my_submissions(req: Request, user=Depends(get_current_user)):
    db = get_db(req)
    submissions = (
        await db.consultancy_submissions.find({"customer.email": user["email"].lower()})
        .sort("created_at", -1)
        .to_list(100)
    )
    return [submission_out(s) for s in submissions]


@router.patch("/me/submissions/{submission_id}/answers", response_model=SubmissionOut)
async def update_my_answers(
    submission_id: str,
    req: Request,
    data: AnswersUpdateIn,
    user=Depends(get_current_user),
):
    db = get_db(req)
    await find_owned_submission(db, submission_id, user)
    timestamp = now()
    answers = await build_answer_snapshot(db, data.answers)
    await db.consultancy_submissions.update_one(
        {"_id": parse_object_id(submission_id)},
        {
            "$set": {
                "answers": answers,
                "answers_changed_at": timestamp,
                "answers_seen_at": None,
                "updated_at": timestamp,
            }
        },
    )
    doc = await db.consultancy_submissions.find_one({"_id": parse_object_id(submission_id)})
    return submission_out(doc)


@router.post("/me/submissions/{submission_id}/renew", response_model=SubmissionOut)
async def renew_my_plan(
    submission_id: str,
    req: Request,
    data: RenewalIn,
    user=Depends(get_current_user),
):
    if not data.payment_reference:
        raise HTTPException(
            status_code=402,
            detail="Pagamento confirmado é obrigatório para renovar o plano",
        )

    db = get_db(req)
    current = await find_owned_submission(db, submission_id, user)
    plan_base = PLANS[data.plan_slug]
    today = date.today()
    current_end = date.fromisoformat(current["plan"]["end_date"])
    start_date = current_end if current_end > today else today
    end_date = add_months(start_date, plan_base["months"])
    timestamp = now()
    renewal = {
        "plan_slug": data.plan_slug,
        "plan_name": plan_base["name"],
        "months": plan_base["months"],
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "payment_reference": data.payment_reference,
        "created_at": timestamp,
    }
    await db.consultancy_submissions.update_one(
        {"_id": parse_object_id(submission_id)},
        {
            "$set": {
                "plan": {
                    "slug": data.plan_slug,
                    "name": plan_base["name"],
                    "months": plan_base["months"],
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                },
                "status": "paid" if data.payment_reference else "pending_payment",
                "payment_reference": data.payment_reference,
                "recurrence_status": "active",
                "recurrence_issue": None,
                "last_renewed_at": timestamp,
                "updated_at": timestamp,
            },
            "$inc": {"renewal_count": 1},
            "$push": {"renewals": renewal},
        },
    )
    doc = await db.consultancy_submissions.find_one({"_id": parse_object_id(submission_id)})
    return submission_out(doc)


@router.get("/admin/questions", response_model=list[QuestionOut])
async def list_admin_questions(req: Request, _user=Depends(role_required("admin"))):
    db = get_db(req)
    questions = await db.consultancy_questions.find({}).sort([("order", 1), ("created_at", 1)]).to_list(200)
    return [question_out(q) for q in questions]


@router.post("/admin/questions", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
async def create_question(req: Request, data: QuestionIn, _user=Depends(role_required("admin"))):
    db = get_db(req)
    timestamp = now()
    doc = data.model_dump()
    doc["created_at"] = timestamp
    doc["updated_at"] = timestamp
    res = await db.consultancy_questions.insert_one(doc)
    doc["_id"] = res.inserted_id
    return question_out(doc)


@router.patch("/admin/questions/{question_id}", response_model=QuestionOut)
async def update_question(question_id: str, req: Request, data: QuestionPatch, _user=Depends(role_required("admin"))):
    db = get_db(req)
    oid = parse_object_id(question_id)
    patch = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if patch:
        patch["updated_at"] = now()
        await db.consultancy_questions.update_one({"_id": oid}, {"$set": patch})
    doc = await db.consultancy_questions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    return question_out(doc)


@router.delete("/admin/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(question_id: str, req: Request, _user=Depends(role_required("admin"))):
    db = get_db(req)
    res = await db.consultancy_questions.delete_one({"_id": parse_object_id(question_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")


@router.get("/admin/submissions", response_model=list[SubmissionOut])
async def list_submissions(req: Request, _user=Depends(role_required("admin"))):
    db = get_db(req)
    submissions = await db.consultancy_submissions.find({}).sort("created_at", -1).to_list(500)
    return [submission_out(s) for s in submissions]


@router.patch("/admin/submissions/{submission_id}", response_model=SubmissionOut)
async def update_submission(
    submission_id: str,
    req: Request,
    data: SubscriptionPatch,
    _user=Depends(role_required("admin")),
):
    db = get_db(req)
    oid = parse_object_id(submission_id)
    patch: dict[str, Any] = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    update: dict[str, Any] = {"updated_at": now()}

    if "status" in patch:
        update["status"] = patch["status"]
    if "payment_reference" in patch:
        update["payment_reference"] = patch["payment_reference"]
    if "start_date" in patch:
        update["plan.start_date"] = patch["start_date"].isoformat() if patch["start_date"] else None
    if "end_date" in patch:
        update["plan.end_date"] = patch["end_date"].isoformat() if patch["end_date"] else None

    await db.consultancy_submissions.update_one({"_id": oid}, {"$set": update})
    doc = await db.consultancy_submissions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Resposta não encontrada")
    return submission_out(doc)


@router.post("/admin/submissions/{submission_id}/answers/seen", response_model=SubmissionOut)
async def mark_answers_seen(submission_id: str, req: Request, _user=Depends(role_required("admin"))):
    db = get_db(req)
    oid = parse_object_id(submission_id)
    await db.consultancy_submissions.update_one(
        {"_id": oid},
        {"$set": {"answers_seen_at": now(), "updated_at": now()}},
    )
    doc = await db.consultancy_submissions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Resposta não encontrada")
    return submission_out(doc)
