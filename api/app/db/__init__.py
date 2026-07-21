from app.db.indexes import ensure_all as ensure_indexes


def adapter():
    from app.core.settings import settings
    from app.db import mongo, postgres

    return mongo if settings.database_adapter == "mongo" else postgres


async def connect(app):
    await adapter().connect(app)


async def disconnect(app):
    await adapter().disconnect(app)


def get_db(request):
    return adapter().get_db(request)


__all__ = ["adapter", "get_db", "connect", "disconnect", "ensure_indexes"]
