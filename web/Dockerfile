# Stage 1: build do React
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json /app/
RUN npm ci || npm i
COPY frontend/ /app/
RUN npm run build

# Stage 2: Caddy servindo estáticos
FROM caddy:2-alpine
COPY web/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /usr/share/caddy
EXPOSE 80
