# app/db/indexes.py

from pymongo import ASCENDING, IndexModel
from motor.motor_asyncio import AsyncIOMotorDatabase

USERS_INDEXES = [
    IndexModel([("email", ASCENDING)], unique=True, name="uniq_email"),
]

ROLES_INDEXES = [
    IndexModel([("name", ASCENDING)], unique=True, name="uniq_role_name"),
]

async def ensure_all(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_indexes(USERS_INDEXES)
    await db.roles.create_indexes(ROLES_INDEXES)
