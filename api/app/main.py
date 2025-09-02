from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.settings import settings

def create_app() -> FastAPI:
    app = FastAPI(title="My API", version="1.0.0")

    @app.on_event("startup")
    async def _startup():
        app.state.mongo_client = AsyncIOMotorClient(settings.mongo_uri)
        # usa DB padrão do URI; se quiser forçar:
        # from urllib.parse import urlparse
        # db_name = urlparse(settings.mongo_uri).path.strip("/") or "myapp"
        app.state.db = app.state.mongo_client.get_default_database()

    @app.on_event("shutdown")
    async def _shutdown():
        app.state.mongo_client.close()

    @app.get("/health")
    async def health():
        # ping no mongo
        try:
            await app.state.db.command("ping")
            mongo = "ok"
        except Exception:
            mongo = "down"
        return {"status": "ok", "mongo": mongo}

    return app

app = create_app()
