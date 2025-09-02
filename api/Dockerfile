FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# dependências mínimas
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic pydantic-settings motor

# código
COPY app /app/app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host","0.0.0.0","--port","8000"]
