import pytest
from types import SimpleNamespace

from app.core.security import verify_password
from app.seeder.seed import seed_admin, seed_all, seed_roles


@pytest.mark.asyncio
async def test_seed_roles_and_two_admins(db, monkeypatch):
    monkeypatch.setattr("app.seeder.seed.settings", SimpleNamespace(configured_admin_accounts=[
        {"email": "admin1@example.com", "password": "secret-one"},
        {"email": "admin2@example.com", "password": "secret-two"},
    ]))
    await seed_roles(db)
    await seed_admin(db)
    assert await db.roles.count_documents({}) == 2
    admins = await db.users.find({"roles": "admin"}).to_list(10)
    assert len(admins) == 2
    assert verify_password("secret-one", next(item for item in admins if item["email"] == "admin1@example.com")["password_hash"])


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
    monkeypatch.setattr("app.seeder.seed.settings", SimpleNamespace(configured_admin_accounts=[
        {"email": "admin@example.com", "password": "secret123"}
    ]))
    monkeypatch.setattr(db.users, "create_index", broken)
    await seed_admin(db)
    assert await db.users.find_one({"email": "admin@example.com"})
    await seed_all(db)
