# app/db/mongo.py

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.settings import settings
from .indexes import ensure_all
from fastapi import Request

async def connect(app):
    client = AsyncIOMotorClient(settings.mongo_uri)
    app.state.mongo_client = client
    app.state.db = client.get_default_database()
    await ensure_all(app.state.db)

async def disconnect(app):
    app.state.mongo_client.close()

def get_db(request: Request):
    return request.app.state.db
