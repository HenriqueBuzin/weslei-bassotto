from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import FastAPI

from app import main


@pytest.mark.asyncio
async def test_health_smoke_with_mongo_up(db):
    app = main.create_app()
    app.router.lifespan_context = asynccontextmanager(lambda _app: _empty_lifespan())
    app.state.db = db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
@pytest.mark.api
async def test_public_plan_catalog(db):
    app = main.create_app()
    app.router.lifespan_context = asynccontextmanager(lambda _app: _empty_lifespan())
    app.state.db = db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/plans")
    assert response.status_code == 200
    assert response.json()[1] == {
        "slug": "semestral",
        "name": "Plano Semestral",
        "months": 6,
        "cash": "997.00",
        "subscription_total": "1093.00",
        "monthly": "182.23",
    }


async def _empty_lifespan():
    yield


@pytest.mark.asyncio
async def test_application_lifespan_connects_seeds_and_disconnects(monkeypatch):
    calls = []

    async def connect(app):
        app.state.db = object()
        calls.append("connect")

    async def seed(db):
        calls.append("seed")

    async def disconnect(app):
        calls.append("disconnect")

    monkeypatch.setattr(main, "connect", connect)
    monkeypatch.setattr(main, "seed_all", seed)
    monkeypatch.setattr(main, "disconnect", disconnect)
    monkeypatch.setattr(main.settings, "seed_on_start", True)
    async with main.lifespan(FastAPI()):
        calls.append("running")
    assert calls == ["connect", "seed", "running", "disconnect"]
