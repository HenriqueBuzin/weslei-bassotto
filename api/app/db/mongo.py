# app/db/mongo.py

from fastapi import Request
from .indexes import ensure_all
from app.core.settings import settings
from motor.motor_asyncio import AsyncIOMotorClient

async def connect(app):
    client = AsyncIOMotorClient(settings.mongo_uri)
    app.state.mongo_client = client
    app.state.db = client.get_default_database()
    await ensure_all(app.state.db)

async def disconnect(app):
    app.state.mongo_client.close()

def get_db(request: Request):
    return request.app.state.db
