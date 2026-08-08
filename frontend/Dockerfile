FROM node:24.18.1-bookworm-slim

WORKDIR /app

ENV TZ=America/Sao_Paulo

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=optional

COPY . .

ARG VITE_PORT
RUN test -n "$VITE_PORT" || (echo "Defina --build-arg VITE_PORT" && exit 1)
EXPOSE ${VITE_PORT}
ENV VITE_PORT=${VITE_PORT}

# O npm ci do build acima e coberto pelo volume react_node_modules, que e
# persistente e sobrevive a deploys: sem reconciliar aqui, o container sobe com a
# arvore de dependencias de um deploy antigo. Espelha o composer install que o
# backend ja faz no boot.
CMD ["dumb-init","sh","-lc",": ${VITE_PORT:?Defina VITE_PORT};     npm ci --no-audit --no-fund;     exec npm run dev -- --host 0.0.0.0 --port ${VITE_PORT}"]
