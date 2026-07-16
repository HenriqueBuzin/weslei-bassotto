from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.deps import get_current_user
from app.db.mongo import get_db
from app.domain.plans import contract_period, get_plan
from app.routers.consultancy_admin import router as admin_router
from app.routers.consultancy_common import (
    build_answer_snapshot,
    find_owned_submission,
    get_active_questions,
    now,
    question_out,
    submission_out,
)
from app.schemas.consultancy import AnswersUpdateIn, QuestionOut, RenewalIn, SubmissionIn, SubmissionOut
from app.services.contracts import create_admin_event
from app.services.payments import get_claimed_approved_payment

router = APIRouter(prefix="/consultancy", tags=["consultancy"])


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


router.include_router(admin_router)
