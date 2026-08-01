from app.db import postgres


async def connect(app):
    await postgres.connect(app)


async def disconnect(app):
    await postgres.disconnect(app)


def get_db(request):
    return postgres.get_db(request)


__all__ = ["get_db", "connect", "disconnect"]
