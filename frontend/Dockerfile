# syntax=docker/dockerfile:1.7-labs
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci || npm i

COPY . .

# --- Porta sem padrão: exige no build e no runtime ---
ARG VITE_PORT
RUN test -n "$VITE_PORT" || (echo "Defina --build-arg VITE_PORT" && exit 1)
EXPOSE ${VITE_PORT}
ENV VITE_PORT=${VITE_PORT}

CMD ["sh","-lc",": ${VITE_PORT:?Defina VITE_PORT}; npm run dev -- --host 0.0.0.0 --port ${VITE_PORT}"]
