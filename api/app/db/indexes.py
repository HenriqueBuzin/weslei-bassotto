# app/db/indexes.py

from pymongo import ASCENDING, IndexModel
from motor.motor_asyncio import AsyncIOMotorDatabase

USERS_INDEXES = [
    IndexModel([("email", ASCENDING)], unique=True, name="uniq_email"),
]

ROLES_INDEXES = [
    IndexModel([("name", ASCENDING)], unique=True, name="uniq_role_name"),
]

CONSULTANCY_QUESTION_INDEXES = [
    IndexModel([("active", ASCENDING), ("order", ASCENDING)], name="idx_question_active_order"),
]

CONSULTANCY_SUBMISSION_INDEXES = [
    IndexModel([("customer.email", ASCENDING)], name="idx_submission_customer_email"),
    IndexModel([("plan.slug", ASCENDING), ("status", ASCENDING)], name="idx_submission_plan_status"),
    IndexModel([("created_at", ASCENDING)], name="idx_submission_created_at"),
]

async def ensure_all(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_indexes(USERS_INDEXES)
    await db.roles.create_indexes(ROLES_INDEXES)
    await db.consultancy_questions.create_indexes(CONSULTANCY_QUESTION_INDEXES)
    await db.consultancy_submissions.create_indexes(CONSULTANCY_SUBMISSION_INDEXES)
