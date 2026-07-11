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

PASSWORD_RESET_TOKEN_INDEXES = [
    IndexModel([("token_hash", ASCENDING)], unique=True, name="uniq_password_reset_token_hash"),
    IndexModel([("user_id", ASCENDING), ("used_at", ASCENDING)], name="idx_password_reset_user_used"),
    IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl_password_reset_expires_at"),
]

PAYMENT_INDEXES = [
    IndexModel([("gateway", ASCENDING), ("external_id", ASCENDING)], unique=True, sparse=True, name="uniq_payment_gateway_external"),
    IndexModel([("claim_token_hash", ASCENDING)], unique=True, name="uniq_payment_claim_token"),
    IndexModel([("status", ASCENDING), ("created_at", ASCENDING)], name="idx_payment_status_created"),
]

PAYMENT_WEBHOOK_INDEXES = [
    IndexModel([("gateway", ASCENDING), ("event_id", ASCENDING)], unique=True, name="uniq_webhook_gateway_event"),
]

CONTRACT_EVENT_INDEXES = [
    IndexModel([("payment_id", ASCENDING), ("type", ASCENDING)], unique=True, name="uniq_contract_payment_event"),
]

ADMIN_EVENT_INDEXES = [
    IndexModel([("seen_at", ASCENDING), ("created_at", ASCENDING)], name="idx_admin_event_seen_created"),
    IndexModel([("submission_id", ASCENDING), ("type", ASCENDING)], name="idx_admin_event_submission_type"),
]

LOGIN_SECURITY_INDEXES = [
    IndexModel([("email", ASCENDING)], unique=True, name="uniq_login_security_email"),
    IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl_login_security_expires"),
]

async def ensure_all(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_indexes(USERS_INDEXES)
    await db.roles.create_indexes(ROLES_INDEXES)
    await db.consultancy_questions.create_indexes(CONSULTANCY_QUESTION_INDEXES)
    await db.consultancy_submissions.create_indexes(CONSULTANCY_SUBMISSION_INDEXES)
    await db.password_reset_tokens.create_indexes(PASSWORD_RESET_TOKEN_INDEXES)
    await db.payments.create_indexes(PAYMENT_INDEXES)
    await db.payment_webhook_events.create_indexes(PAYMENT_WEBHOOK_INDEXES)
    await db.contract_events.create_indexes(CONTRACT_EVENT_INDEXES)
    await db.admin_events.create_indexes(ADMIN_EVENT_INDEXES)
    await db.login_security.create_indexes(LOGIN_SECURITY_INDEXES)
