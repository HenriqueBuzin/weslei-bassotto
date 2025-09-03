# app/main.py
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core import settings  # <- agora importa do pacote, não do submódulo

def create_app() -> FastAPI:
    app = FastAPI(title="My API", version="1.0.0")

    @app.on_event("startup")
    async def _startup() -> None:
        app.state.mongo_client = AsyncIOMotorClient(settings.mongo_uri)
        # tipagem opcional (útil p/ mypy/IDE):
        db: AsyncIOMotorDatabase = app.state.mongo_client.get_default_database()
        app.state.db = db

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        app.state.mongo_client.close()

    @app.get("/health")
    async def health():
        try:
            await app.state.db.command("ping")
            mongo = "ok"
        except Exception:
            mongo = "down"
        return {"status": "ok", "mongo": mongo}

    return app

app = create_app()
