# syntax=docker/dockerfile:1.7-labs

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 1) Instala as deps a partir do pyproject (camada cacheável)
COPY pyproject.toml /app/
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install -U pip && \
    python -m pip install .

# 2) Copia o código
COPY app /app/app

# 3) Porta sem padrão: exige em build e em runtime
ARG API_PORT
RUN test -n "$API_PORT" || (echo "Defina --build-arg API_PORT" && exit 1)
EXPOSE ${API_PORT}

# 4) Porta SEM padrão: exige em runtime
ENV API_PORT=${API_PORT}
CMD ["sh","-lc",": ${API_PORT:?Defina API_PORT}; uvicorn app.main:app --host 0.0.0.0 --port ${API_PORT}"]
