# weslei-bassotto

Weslei Bassotto

## Desenvolvimento (profile: dev)

```bash
# build das imagens
docker compose --profile dev build

# sobe os serviços de DEV (Caddy em :8080)
docker compose --profile dev up -d

# logs em tempo real
docker compose --profile dev logs -f

# parar/remover
docker compose --profile dev down
```

## Desenvolvimento (profile: prod)

```bash
docker compose --profile prod build

# sobe os serviços de PROD (80/443)
docker compose --profile prod up -d

# logs em tempo real
docker compose --profile prod logs -f

# parar/remover
docker compose --profile prod down
```
