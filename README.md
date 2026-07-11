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

## Arquitetura de pagamentos

- A home permanece isolada das regras de pagamento.
- Planos e períodos ficam em `api/app/domain`.
- Gateways implementam `PaymentGateway`, definido em `api/app/payments/contracts.py`.
- O serviço de pagamentos seleciona o adapter, registra tentativas e processa webhooks com idempotência.
- Contratos, renovações, revisões da anamnese e alertas são persistidos no MongoDB.

Para adicionar outro gateway, implemente `PaymentGateway`, registre-o em `build_gateway_registry()` e inclua seu nome em `PAYMENT_GATEWAY_ORDER`. O fallback só ocorre quando o adapter informa indisponibilidade antes de uma cobrança ser aceita. Recusas ou respostas ambíguas não são reenviadas automaticamente, evitando cobrança duplicada.

## Testes

```bash
cd api
python -m pip install -e ".[test]"
pytest --cov=app --cov-branch --cov-report=term-missing --cov-fail-under=100
pytest -m unit
pytest -m "integration and api"
pytest -m functional
pytest -m regression
pytest -m smoke

cd ../frontend
npm ci
npm run test:coverage
npm run test:unit
npm run test:integration
npm run test:functional
npm run test:regression
npm run test:smoke
npm run test:api
npm run test:e2e
npm run build
```

O Jenkins executa testes unitários, de API, funcionais, regressão, integração, smoke, E2E em desktop/mobile e o build antes do deploy. O backend exige 100% incluindo branches. O frontend exige 100% de statements e linhas, 90% de branches e 85% de funções.

## Administradores iniciais

Use uma lista JSON extensível no ambiente. Em produção, configure inicialmente dois administradores:

```env
ADMIN_ACCOUNTS=[{"email":"admin1@dominio.com","password":"senha-forte-1"},{"email":"admin2@dominio.com","password":"senha-forte-2"}]
```

O seeder garante cada conta e adiciona a role `admin`. `ADMIN_EMAIL` e `ADMIN_PASSWORD` continuam aceitos apenas como compatibilidade para ambientes antigos.

## Webhook do Mercado Pago

Configure no painel do Mercado Pago:

```text
https://SEU_DOMINIO/api/v1/payments/webhooks/mercado_pago
```

Salve a assinatura secreta em `MERCADO_PAGO_WEBHOOK_SECRET`, com valores diferentes em desenvolvimento e produção. Consulte `.env.example` para a lista completa de variáveis.
