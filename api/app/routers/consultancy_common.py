from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.schemas.consultancy import QuestionOut, SubmissionOut


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
