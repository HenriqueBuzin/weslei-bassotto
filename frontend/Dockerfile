FROM node:22-bookworm-slim

WORKDIR /app

# deps de runtime (opcional, mas bom pra sinal/kill limpo)
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=optional

COPY . .

ARG VITE_PORT
RUN test -n "$VITE_PORT" || (echo "Defina --build-arg VITE_PORT" && exit 1)
EXPOSE ${VITE_PORT}
ENV VITE_PORT=${VITE_PORT}

CMD ["dumb-init","sh","-lc",": ${VITE_PORT:?Defina VITE_PORT}; npm run dev -- --host 0.0.0.0 --port ${VITE_PORT}"]
