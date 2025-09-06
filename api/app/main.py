# app/main.py

from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from app import __title__, __version__, __description__
from app.core import settings
from app.db import connect, disconnect
from app.routers import ROUTERS
from app.seeder import seed_all

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect(app)
    if settings.seed_on_start:
        await seed_all(app.state.db)
    try:
        yield
    finally:
        await disconnect(app)

def create_app() -> FastAPI:
    app = FastAPI(
        title=__title__,
        version=__version__,
        description=__description__,
        lifespan=lifespan,
        docs_url=f"{settings.api_base}/docs",
        openapi_url=f"{settings.api_base}/openapi.json",
    )

    allow_creds = not (len(settings.cors_allowed_origins) == 1 and settings.cors_allowed_origins[0] == "*")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=allow_creds,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in ROUTERS:
        app.include_router(router, prefix=settings.api_base)

    @app.get("/health", include_in_schema=False)
    @app.get(f"{settings.api_base}/health", include_in_schema=False)
    async def health():
        try:
            await app.state.db.command("ping")
            mongo = "ok"
        except Exception:
            mongo = "down"
        return {
            "status": "ok",
            "mongo": mongo,
            "version": __version__,
            "env": settings.app_env,
            "api_base": settings.api_base,
        }

    return app

app = create_app()
