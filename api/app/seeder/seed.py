# app/seeder/seed.py

from datetime import datetime, timezone

from app.core.security import hash_password
from app.core.settings import settings


async def seed_roles(db):
    # índice único em roles.name (idempotente)
    try:
        await db.roles.create_index("name", unique=True, name="uniq_role_name")
    except Exception:
        pass  # já existe

    for name, desc in (("admin", "Administrador"), ("user", "Usuário padrão")):
        await db.roles.update_one(
            {"name": name},
            {"$setOnInsert": {"name": name, "description": desc}},
            upsert=True,
        )


async def seed_admin(db):
    accounts = settings.configured_admin_accounts
    if not accounts:
        print("[SEED] ADMIN_ACCOUNTS não definido; pulando criação de admin.")
        return

    # índice único em users.email (idempotente)
    try:
        await db.users.create_index("email", unique=True, name="uniq_user_email")
    except Exception:
        pass  # já existe

    for account in accounts:
        email, password = account["email"], account["password"]
        await db.users.update_one(
            {"email": email},
            {
                "$setOnInsert": {
                    "email": email,
                    "password_hash": hash_password(password),
                    "roles": [],
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        await db.users.update_one({"email": email}, {"$addToSet": {"roles": "admin"}})
        print(f"[SEED] Admin garantido: {email}")


async def database_has_documents(db) -> bool:
    for collection_name in await db.list_collection_names():
        if await getattr(db, collection_name).find_one({}) is not None:
            return True
    return False


async def seed_all(db):
    if await database_has_documents(db):
        print("[SEED] Banco com dados; carga inicial ignorada.")
        return False

    await seed_roles(db)
    await seed_admin(db)
    print("[SEED] Carga inicial concluída.")
    return True
