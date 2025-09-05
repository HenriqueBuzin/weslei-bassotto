# --- Stage 1: build do React ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Vite lê VITE_* em tempo de build
ARG VITE_API_BASE
RUN test -n "$VITE_API_BASE" || (echo "Defina --build-arg VITE_API_BASE" && exit 1)
ENV VITE_API_BASE=${VITE_API_BASE}
ENV NODE_ENV=production

# deps do sistema só se precisar (geralmente não precisa p/ Vite)
# RUN apt-get update && apt-get install -y --no-install-recommends \
#   build-essential python3 ca-certificates && rm -rf /var/lib/apt/lists/*

# Instala deps com bom cache
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Copia o código e builda
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Caddy servindo estáticos ---
FROM caddy:2-alpine
COPY --from=build /app/dist /usr/share/caddy
COPY web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
