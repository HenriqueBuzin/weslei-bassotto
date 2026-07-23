# weslei-bassotto

Weslei Bassotto

## Desenvolvimento (profile: dev)

```bash
export COMPOSE_PROJECT_NAME=weslei-bassotto-dev

# build das imagens
docker compose --profile dev build

# sobe os serviços de DEV na rede Docker compartilhada
docker compose --profile dev up -d

# logs em tempo real
docker compose --profile dev logs -f

# parar/remover
docker compose --profile dev down
```

## Produção (profile: prod)

```bash
export COMPOSE_PROJECT_NAME=weslei-bassotto-prod

docker compose --profile prod build

# sobe os serviços de PROD na rede Docker compartilhada
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
- Contratos, renovações, revisões da anamnese e alertas são persistidos no PostgreSQL compartilhado da VPS. O adapter Mongo permanece disponível no código, mas fica desabilitado enquanto `DB_ADAPTER=postgres`.

## Proxy e banco compartilhados

O projeto não publica portas HTTP no host e não cria bancos internos. O Nginx Proxy Manager deve estar conectado à `proxy-network` e encaminhar para:

- desenvolvimento: `weslei-bassotto-dev:80`;
- produção: `weslei-bassotto:80`.

API e PostgreSQL compartilham a rede externa definida por `POSTGRES_NETWORK` (padrão `postgres-network`). A `DATABASE_URL` usa o alias `postgres`, por exemplo `postgresql://usuario:senha@postgres:5432/weslei_bassotto`.

Somente um adapter pode estar ativo: com `DB_ADAPTER=postgres`, preencha `DATABASE_URL` e deixe `MONGO_URI=`; com `DB_ADAPTER=mongo`, preencha `MONGO_URI` e deixe `DATABASE_URL=`. A aplicação recusa a inicialização se as duas conexões estiverem preenchidas ou se a conexão selecionada estiver vazia.

Produção e desenvolvimento rodam simultaneamente e precisam permanecer isolados:

- produção usa o projeto Compose `weslei-bassotto-prod`, banco `weslei_bassotto` e um usuário exclusivo, como `weslei_app`;
- desenvolvimento usa o projeto Compose `weslei-bassotto-dev`, banco `weslei_bassotto_dev` e um usuário exclusivo, como `weslei_dev`;
- os dois compartilham somente o servidor PostgreSQL e as redes externas; não compartilham credenciais, banco, containers, imagens de projeto ou volumes.

Na VPS, `/root/projects/envs/weslei-bassotto.env` configura produção e `/root/projects/envs/weslei-bassotto-dev.env` configura desenvolvimento. A senha de cada `DATABASE_URL` deve ser exatamente a senha da respectiva role no PostgreSQL. O Jenkins define `COMPOSE_PROJECT_NAME` por branch, independentemente do valor presente nesses arquivos.

Para adicionar outro gateway, implemente `PaymentGateway`, registre-o em `build_gateway_registry()` e inclua seu nome em `PAYMENT_GATEWAY_ORDER`. O fallback só ocorre quando o adapter informa indisponibilidade antes de uma cobrança ser aceita. Recusas ou respostas ambíguas não são reenviadas automaticamente, evitando cobrança duplicada.

## Testes

```bash
cd api
poetry install
poetry run black .
poetry run isort .
poetry run flake8 .
poetry run pytest --cov=app --cov-branch --cov-report=term-missing --cov-fail-under=100
poetry run pytest -m unit
poetry run pytest -m "integration and api"
poetry run pytest -m functional
poetry run pytest -m regression
poetry run pytest -m smoke

cd ../frontend
npm ci
npm run format
npm run format:check
npm run lint
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

O Jenkins executa testes unitários, de API, funcionais, regressão, integração, smoke, E2E em desktop/mobile e o build antes do deploy. Backend e frontend exigem 100% de statements, linhas, branches e funções.

### Validação automática

Execute todos os mesmos gates localmente com um único comando:

```bash
python scripts/validate.py
```

Ative uma vez o hook versionado para impedir commits quando qualquer teste, cobertura, build ou E2E falhar:

```bash
git config core.hooksPath .githooks
```

O ambiente Poetry local deste projeto fica em `C:\Users\henri\Documents\Projects\venv\weslei-bassotto`. O hook `pre-commit` executa Black, isort e Flake8 no backend; Prettier e ESLint no frontend; e depois `scripts/validate.py`. O workflow `.github/workflows/quality.yml` repete as validações em todo push e pull request para `main` e `dev`, mesmo quando o hook local não estiver instalado. O Jenkins permanece responsável pela validação final e pelo deploy.

## Administradores iniciais

Use uma lista JSON extensível no ambiente. Em produção, configure inicialmente dois administradores:

```env
ADMIN_ACCOUNTS=[{"email":"admin1@dominio.com","password":"senha-forte-1"},{"email":"admin2@dominio.com","password":"senha-forte-2"}]
```

Com `SEED_ON_START=true`, o seeder cria roles e administradores somente quando o banco inteiro não possui documentos. Depois da primeira carga, qualquer dado existente faz o seed ser ignorado: deploys futuros não alteram contas, senhas, roles nem dados operacionais. `ADMIN_EMAIL` e `ADMIN_PASSWORD` continuam aceitos apenas como compatibilidade para ambientes antigos.

## Webhook do Mercado Pago

Configure no painel do Mercado Pago:

```text
https://SEU_DOMINIO/api/v1/payments/webhooks/mercado_pago
```

Salve a assinatura secreta em `MERCADO_PAGO_WEBHOOK_SECRET`, com valores diferentes em desenvolvimento e produção. Consulte `.env.example` para a lista completa de variáveis.
