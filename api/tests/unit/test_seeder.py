from types import SimpleNamespace

import pytest

from app.core.security import verify_password
from app.seeder.seed import database_has_documents, seed_admin, seed_all, seed_roles


@pytest.mark.asyncio
async def test_seed_roles_and_two_admins(db, monkeypatch):
    monkeypatch.setattr(
        "app.seeder.seed.settings",
        SimpleNamespace(
            configured_admin_accounts=[
                {"email": "admin1@example.com", "password": "secret-one"},
                {"email": "admin2@example.com", "password": "secret-two"},
            ]
        ),
    )
    await seed_roles(db)
    await seed_admin(db)
    assert await db.roles.count_documents({}) == 2
    admins = await db.users.find({"roles": "admin"}).to_list(10)
    assert len(admins) == 2
    assert verify_password(
        "secret-one", next(item for item in admins if item["email"] == "admin1@example.com")["password_hash"]
    )


@pytest.mark.asyncio
async def test_seed_admin_skips_when_not_configured(db, monkeypatch, capsys):
    monkeypatch.setattr("app.seeder.seed.settings", SimpleNamespace(configured_admin_accounts=[]))
    await seed_admin(db)
    assert "pulando" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_seed_ignores_existing_index_errors_and_seed_all_calls_both(db, monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError("already exists")

    monkeypatch.setattr(db.roles, "create_index", broken)
    await seed_roles(db)
    monkeypatch.setattr(
        "app.seeder.seed.settings",
        SimpleNamespace(configured_admin_accounts=[{"email": "admin@example.com", "password": "secret123"}]),
    )
    monkeypatch.setattr(db.users, "create_index", broken)
    await seed_admin(db)
    assert await db.users.find_one({"email": "admin@example.com"})


@pytest.mark.asyncio
async def test_seed_all_only_populates_database_without_documents(db, monkeypatch, capsys):
    monkeypatch.setattr(
        "app.seeder.seed.settings",
        SimpleNamespace(configured_admin_accounts=[{"email": "admin@example.com", "password": "secret123"}]),
    )
    await db.audit_events.create_index("created_at")

    assert await database_has_documents(db) is False
    assert await seed_all(db) is True
    assert await db.roles.count_documents({}) == 2
    assert await db.users.count_documents({}) == 1
    assert "Carga inicial concluída" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_seed_all_preserves_any_existing_production_data(db, monkeypatch, capsys):
    monkeypatch.setattr(
        "app.seeder.seed.settings",
        SimpleNamespace(configured_admin_accounts=[{"email": "admin@example.com", "password": "secret123"}]),
    )
    await db.audit_events.create_index("created_at")
    await db.consultancy_submissions.insert_one({"status": "existing"})

    assert await database_has_documents(db) is True
    assert await seed_all(db) is False
    assert await db.roles.count_documents({}) == 0
    assert await db.users.count_documents({}) == 0
    assert await db.consultancy_submissions.count_documents({}) == 1
    assert "Banco com dados" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_database_scan_skips_empty_collections_before_finding_data():
    class Collection:
        def __init__(self, document):
            self.document = document

        async def find_one(self, query):
            return self.document

    db = SimpleNamespace(
        list_collection_names=lambda: _collection_names(),
        empty=Collection(None),
        populated=Collection({"status": "existing"}),
    )

    assert await database_has_documents(db) is True


@pytest.mark.asyncio
async def test_seed_index_exception_handlers():
    class Collection:
        async def create_index(self, *args, **kwargs):
            raise RuntimeError("exists")

        async def update_one(self, *args, **kwargs):
            return None

    db = SimpleNamespace(roles=Collection(), users=Collection())
    await seed_roles(db)
    original = __import__("app.seeder.seed", fromlist=["settings"]).settings
    old_accounts = original.admin_accounts
    old_email, old_password = original.admin_email, original.admin_password
    try:
        original.admin_accounts = []
        original.admin_email = "admin@example.com"
        original.admin_password = "secret123"
        await seed_admin(db)
    finally:
        original.admin_accounts = old_accounts
        original.admin_email, original.admin_password = old_email, old_password


async def _collection_names():
    return ["empty", "populated"]
