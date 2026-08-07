# Contrato de reconstrução

Este é o contrato técnico canônico de Weslei Bassotto. O `README.md` atende
pessoas; este arquivo orienta agentes e deve permitir reconstruir a aplicação
sem eliminar fluxos, regras ou integrações.

## Produto e domínios

Plataforma web com React e Laravel para apresentação, autenticação,
administradores, anamnese, planos, contratos, pagamentos, renovações, alertas e
webhooks. A home é independente das regras de pagamento. Planos e períodos
vivem em `api/app/Domain`. Gateways implementam `PaymentGateway`; o registry
define ordem e fallback. Nunca reenviar cobrança recusada ou ambígua; fallback
só antes de uma cobrança aceita. Webhooks são idempotentes.

Persistência usa exclusivamente PostgreSQL externo, configurado por
`DATABASE_URL`. O processo deve recusar a ausência dessa conexão. Seeder só
roda quando o banco inteiro está vazio e nunca sobrescreve contas/dados
existentes.

## Arquitetura e versões

- `api`: PHP 8.5.9, Composer 2.10.1, Laravel 13 API-only.
  Dev serve por `artisan serve`; produção por PHP-FPM atrás do Caddy.
- `frontend`: React/React DOM 19.2.8, somente TypeScript estrito.
- Node 24.18.1 LTS, npm 11.16.0, TypeScript 6.0.3, Vite 8.1.5,
  Vitest 4.1.10 e Playwright 1.62.0.
- produção web: Caddy 2.11.4; Nginx não é permitido.
- qualidade PHP: Pint (formatação) e PHPStan/Larastan nível 7 (análise
  estática), nas versões do lock. Cobertura de branches exige Xdebug.

Versões são exatas e lockfiles acompanham mudanças. Node/npm são bloqueados por
`.nvmrc`, `engines`, `packageManager` e `engine-strict=true`. O frontend não
pode conter JSX/JavaScript de aplicação.

## APIs, dados e segurança

Rotas da API usam prefixo `/api/v1` e ficam em inglês; pagamentos Mercado Pago
recebem webhook em `/api/v1/payments/webhooks/mercado_pago`. Cookies, JWT, lock
de login, CORS e expirações vêm do env.

Erros respondem `{code, detail}`: `code` é um identificador estável em
snake_case e `detail` é inglês. Falhas de validação usam
`code: validation_failed` e listam os campos em `fields`. O texto pt-BR que o
usuário lê vive no catálogo do frontend em `frontend/src/lib/errors.ts`, nunca
no backend. As rotas do frontend, ao contrário, são pt-BR e ficam em
`frontend/src/routes/paths.ts`; cada tela é endereçável para o F5 restaurar o
mesmo estado. `/redefinir-senha` não muda sem mudar o e-mail que o backend
envia. A cópia destinada ao usuário final fica em `api/lang/pt_BR`, e
`fallback_locale` é `en` para as mensagens do framework resolverem.

PostgreSQL é externo. O repositório não instala banco ou Redis.
Backend entra em `POSTGRES_NETWORK` apenas quando precisa do banco e web entra
somente em `proxy-network`. Produção e dev usam bancos, usuários, secrets,
imagens e projetos separados.

Segredos chegam por Compose Secrets e `*_FILE`, incluindo `APP_KEY`, conexão,
JWT, Mercado Pago e SMTP. Senha de administrador nunca vive no env: o seeder
cria com placeholder e `must_change_password`. `.env` é link para
`/root/projects/envs/weslei-bassotto.env` ou
`/root/projects/envs/weslei-bassotto-dev.env`.
Valores nunca entram em imagem, logs ou Git.

## Testes

Backend possui testsuites unit, integration, api, functional, regression e
smoke; frontend possui as mesmas categorias e E2E desktop/mobile. Pint,
PHPStan, Prettier, ESLint, typecheck e build são obrigatórios.

O frontend mantém 100% de statements, linhas, branches e functions. O backend
mantém 100% de linhas, garantido por `api/scripts/coverage-gate.php`, já que
PHPUnit não tem `--cov-fail-under`. Branches param em ~95% por limite de
medição, não por teste faltando: o Xdebug emite uma aresta de exceção por
chamada interna (`str_contains`, `trim`, `implode`) que nenhum input alcança —
inspecione com `api/scripts/branch-gaps.php` antes de perseguir o número.

`scripts/validate.py` é o gate local agregado e roda as portas do backend
dentro da imagem `test`. E2E usa Playwright.

## Docker, Compose e entrega

Existem exatamente `docker-compose.yml` para dev e
`docker-compose-prod.yml` para produção, sem `version` e profiles. Projetos:
`weslei-bassotto-dev` e `weslei-bassotto`. Serviços têm nomes funcionais
`backend`, `frontend` e `web`. Comandos ficam nos Dockerfiles, nunca no
Compose. Targets/imagens usam Node 24.18.1, PHP 8.5.9 e Caddy 2.11.4.

O Dockerfile da API tem os targets `vendor`, `dev`, `test` e `prod`. Dois
detalhes não são negociáveis: o OPcache já vem compilado no PHP 8.5, então
pedi-lo ao `docker-php-ext-install` quebra o build; e `listen` é diretiva de
pool, então `php-fpm -d listen=...` é ignorado e a porta precisa vir de um
arquivo em `php-fpm.d/`. O `composer dump-autoload` do build roda com
`--no-scripts` porque `package:discover` valida o env, e os segredos só
existem em runtime.

Em produção o Caddy fala FastCGI com o backend (`transport fastcgi`), não HTTP:
um `reverse_proxy` simples entregaria HTTP cru ao FPM. Por isso o healthcheck
de produção é `php artisan platform:health` pela CLI, e não uma sonda HTTP.

Todo serviço define init, graceful stop, restart, healthcheck, labels, logs
rotacionados e `no-new-privileges`. Imagens levam SHA e `-dev` somente em dev.

Healthchecks são honestos: `/health` responde 503 quando o banco está
inalcançável, porque o deploy é aprovado por `up -d --wait` e um check que
sempre diz `ok` deixaria release quebrada passar como verde. Healthcheck em
Compose não pode conter `$`: o Compose interpola antes do shell ver.

Jenkins usa exatamente `Install`, `Verify`, `Compose`, `Container` e `Deploy`;
valida tudo antes da interrupção e aguarda healthcheck. GitHub Actions roda em
`main`/`dev`, actions por SHA, todas as categorias, Compose, imagens, SBOM e
scan. `main` e `dev` terminam com a mesma árvore.

## Critério de aceite

Todos os fluxos de autenticação, planos, anamnese, pagamentos, contratos,
webhooks, admins e seed permanecem; pagamentos mantêm idempotência; cobertura
permanece 100% no frontend e 100% de linhas no backend; Compose e containers
ficam saudáveis; nenhum banco é criado; árvores `main`/`dev` são iguais.
