# Contrato de reconstrução

Este é o contrato técnico canônico de Weslei Bassotto. O `README.md` atende
pessoas; este arquivo orienta agentes e deve permitir reconstruir a aplicação
sem eliminar fluxos, regras ou integrações.

## Produto e domínios

Plataforma web com React e FastAPI para apresentação, autenticação,
administradores, anamnese, planos, contratos, pagamentos, renovações, alertas e
webhooks. A home é independente das regras de pagamento. Planos e períodos
vivem em `api/app/domain`. Gateways implementam `PaymentGateway`; o registry
define ordem e fallback. Nunca reenviar cobrança recusada ou ambígua; fallback
só antes de uma cobrança aceita. Webhooks são idempotentes.

Persistência usa exclusivamente PostgreSQL externo, configurado por
`DATABASE_URL`. O processo deve recusar a ausência dessa conexão. Seeder só
roda quando o banco inteiro está vazio e nunca sobrescreve contas/dados
existentes.

## Arquitetura e versões

- `api`: Python 3.14.6, Poetry 2.4.1, FastAPI/Uvicorn.
- `frontend`: React/React DOM 19.2.8, somente TypeScript estrito.
- Node 24.18.1 LTS, npm 11.16.0, TypeScript 6.0.3, Vite 8.1.5,
  Vitest 4.1.10 e Playwright 1.62.0.
- produção web: Caddy 2.11.4; Nginx não é permitido.
- qualidade Python: Black, isort e Flake8 nas versões do lock.

Versões são exatas e lockfiles acompanham mudanças. Node/npm são bloqueados por
`.nvmrc`, `engines`, `packageManager` e `engine-strict=true`. O frontend não
pode conter JSX/JavaScript de aplicação.

## APIs, dados e segurança

Rotas usam prefixo `/api/v1`; pagamentos Mercado Pago recebem webhook em
`/api/v1/payments/webhooks/mercado_pago`. FastAPI expõe `/docs` e
`/openapi.json` em dev; produção deve desabilitar ou proteger documentação.
Cookies, JWT, lock de login, CORS e expirações vêm do env.

PostgreSQL é externo. O repositório não instala banco ou Redis.
Backend entra em `POSTGRES_NETWORK` apenas quando precisa do banco e web entra
somente em `proxy-network`. Produção e dev usam bancos, usuários, secrets,
imagens e projetos separados.

Segredos chegam por Compose Secrets e `*_FILE`, incluindo conexão, JWT,
admins, Mercado Pago e SMTP. `.env` é link para
`/root/projects/envs/weslei-bassotto.env` ou
`/root/projects/envs/weslei-bassotto-dev.env`.
Valores nunca entram em imagem, logs ou Git.

## Testes

Backend possui markers unit, integration, api, functional, regression e
smoke; frontend possui as mesmas categorias e E2E desktop/mobile. Black, isort,
Flake8, Prettier, ESLint, typecheck e build são obrigatórios. Cobertura é 100%
de statements, linhas, branches e functions. `scripts/validate.py` é o gate
local agregado. E2E usa a plataforma configurada e Playwright como fallback.

## Docker, Compose e entrega

Existem exatamente `docker-compose.yml` para dev e
`docker-compose-prod.yml` para produção, sem `version` e profiles. Projetos:
`weslei-bassotto-dev` e `weslei-bassotto`. Serviços têm nomes funcionais
`backend`, `frontend` e `web`. Comandos ficam nos Dockerfiles, nunca no
Compose. Targets/imagens usam Node 24.18.1, Python 3.14.6 e Caddy 2.11.4.

Todo serviço define init, graceful stop, restart, healthcheck, labels, logs
rotacionados e `no-new-privileges`. Imagens levam SHA e `-dev` somente em dev.
Swagger deve estar habilitado nos containers dev.

Jenkins usa exatamente `Install`, `Verify`, `Compose`, `Container` e `Deploy`;
valida tudo antes da interrupção e aguarda healthcheck. GitHub Actions roda em
`main`/`dev`, actions por SHA, todas as categorias, Compose, imagens, SBOM e
scan. `main` e `dev` terminam com a mesma árvore.

## Critério de aceite

Todos os fluxos de autenticação, planos, anamnese, pagamentos, contratos,
webhooks, admins e seed permanecem; pagamentos mantêm idempotência;
documentação existe em dev; cobertura permanece 100%; Compose e
containers ficam saudáveis; nenhum banco é criado; árvores `main`/`dev` são
iguais.
