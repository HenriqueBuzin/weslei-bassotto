from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import role_required
from app.db import get_db
from app.routers.consultancy_common import now, parse_record_id, question_out, submission_out
from app.schemas.consultancy import QuestionIn, QuestionOut, QuestionPatch, SubmissionOut, SubscriptionPatch

router = APIRouter(prefix="/admin")


@router.get("/questions", response_model=list[QuestionOut])
async def list_admin_questions(req: Request, _user=Depends(role_required("admin"))):
    docs = await get_db(req).consultancy_questions.find({}).sort([("order", 1), ("created_at", 1)]).to_list(200)
    return [question_out(doc) for doc in docs]


@router.post("/questions", response_model=QuestionOut, status_code=201)
async def create_question(req: Request, data: QuestionIn, _user=Depends(role_required("admin"))):
    timestamp = now()
    doc = {**data.model_dump(), "created_at": timestamp, "updated_at": timestamp}
    result = await get_db(req).consultancy_questions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return question_out(doc)


@router.patch("/questions/{question_id}", response_model=QuestionOut)
async def update_question(question_id: str, req: Request, data: QuestionPatch, _user=Depends(role_required("admin"))):
    db, oid = get_db(req), parse_record_id(question_id)
    patch = data.model_dump(exclude_unset=True)
    if patch:
        await db.consultancy_questions.update_one({"_id": oid}, {"$set": {**patch, "updated_at": now()}})
    doc = await db.consultancy_questions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    return question_out(doc)


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(question_id: str, req: Request, _user=Depends(role_required("admin"))):
    if (await get_db(req).consultancy_questions.delete_one({"_id": parse_record_id(question_id)})).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")


@router.get("/submissions", response_model=list[SubmissionOut])
async def list_submissions(req: Request, _user=Depends(role_required("admin"))):
    docs = await get_db(req).consultancy_submissions.find({}).sort("created_at", -1).to_list(500)
    return [submission_out(doc) for doc in docs]


@router.patch("/submissions/{submission_id}", response_model=SubmissionOut)
async def update_submission(
    submission_id: str, req: Request, data: SubscriptionPatch, _user=Depends(role_required("admin"))
):
    db, oid = get_db(req), parse_record_id(submission_id)
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


@router.post("/submissions/{submission_id}/answers/seen", response_model=SubmissionOut)
async def mark_answers_seen(submission_id: str, req: Request, _user=Depends(role_required("admin"))):
    db, oid = get_db(req), parse_record_id(submission_id)
    timestamp = now()
    await db.consultancy_submissions.update_one(
        {"_id": oid}, {"$set": {"answers_seen_at": timestamp, "updated_at": timestamp}}
    )
    doc = await db.consultancy_submissions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    await db.admin_events.update_many(
        {"submission_id": oid, "type": "answers_changed", "seen_at": None}, {"$set": {"seen_at": timestamp}}
    )
    return submission_out(doc)


@router.get("/events")
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


@router.post("/events/{event_id}/seen")
async def mark_admin_event_seen(event_id: str, req: Request, _user=Depends(role_required("admin"))):
    result = await get_db(req).admin_events.update_one({"_id": parse_record_id(event_id)}, {"$set": {"seen_at": now()}})
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    return {"ok": True}
