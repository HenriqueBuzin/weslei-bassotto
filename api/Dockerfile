# syntax=docker/dockerfile:1.7-labs
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 1) Instala deps a partir do requirements.txt (com cache do pip)
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -U pip && \
    pip install -r requirements.txt

# 2) Copia o código
COPY app /app/app

# 3) Porta sem padrão: exige em build e em runtime
ARG API_PORT
RUN test -n "$API_PORT" || (echo "Defina --build-arg API_PORT" && exit 1)
EXPOSE ${API_PORT}
ENV API_PORT=${API_PORT}

# 4) Sobe o Uvicorn usando a porta do env (falha se não vier)
CMD ["sh","-lc",": ${API_PORT:?Defina API_PORT}; uvicorn app.main:app --host 0.0.0.0 --port ${API_PORT}"]
