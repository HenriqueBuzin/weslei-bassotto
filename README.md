# weslei-bassotto

Weslei Bassotto

## Desenvolvimento

```bash
# build das imagens
docker compose -f docker-compose.yml build

# sobe os serviços de DEV na rede Docker compartilhada
docker compose -f docker-compose.yml up -d

# logs em tempo real
docker compose -f docker-compose.yml logs -f

# parar/remover
docker compose -f docker-compose.yml down
```

## Produção

```bash
docker compose -f docker-compose-prod.yml build

# sobe os serviços de PROD na rede Docker compartilhada
docker compose -f docker-compose-prod.yml up -d

# logs em tempo real
docker compose -f docker-compose-prod.yml logs -f

# parar/remover
docker compose -f docker-compose-prod.yml down
```

## Arquitetura de pagamentos

- A home permanece isolada das regras de pagamento.
- Planos e períodos ficam em `api/app/domain`.
- Gateways implementam `PaymentGateway`, definido em `api/app/payments/contracts.py`.
- O serviço de pagamentos seleciona o adapter, registra tentativas e processa webhooks com idempotência.
- Contratos, renovações, revisões da anamnese e alertas são persistidos no PostgreSQL compartilhado da VPS.

## Proxy e banco compartilhados

O projeto não publica portas HTTP no host e não cria bancos internos. O Caddy deve estar conectado à `proxy-network` e encaminhar para:

- desenvolvimento: `weslei-bassotto-dev:80`;
- produção: `weslei-bassotto:80`.

API e PostgreSQL compartilham a rede externa definida por `POSTGRES_NETWORK` (padrão `postgres-network`). A `DATABASE_URL` usa o alias `postgres`, por exemplo `postgresql://usuario:senha@postgres:5432/weslei_bassotto`.

`DATABASE_URL` é obrigatória. O projeto usa exclusivamente PostgreSQL e recusa a inicialização quando a conexão não está configurada.

Produção e desenvolvimento rodam simultaneamente e precisam permanecer isolados:

- produção usa o projeto Compose `weslei-bassotto`, banco `weslei_bassotto` e um usuário exclusivo, como `weslei_app`;
- desenvolvimento usa o projeto Compose `weslei-bassotto-dev`, banco `weslei_bassotto_dev` e um usuário exclusivo, como `weslei_dev`;
- os dois compartilham somente o servidor PostgreSQL e as redes externas; não compartilham credenciais, banco, containers, imagens de projeto ou volumes.

Na VPS, `/root/projects/envs/weslei-bassotto.env` configura produção e `/root/projects/envs/weslei-bassotto-dev.env` configura desenvolvimento. A senha de cada `DATABASE_URL` deve ser exatamente a senha da respectiva role no PostgreSQL. Os nomes dos projetos são definidos pelos arquivos Compose: `weslei-bassotto` em produção e `weslei-bassotto-dev` em desenvolvimento.

## Docker Secrets

O Jenkins mantém o link simbólico `.env` apontando para o arquivo de cada
ambiente. O Docker Compose lê esse arquivo e usa os valores sensíveis como
origem dos secrets, sem enviá-los como variáveis de ambiente para a API:

```text
.env -> Docker Compose -> /run/secrets/<nome> -> VARIAVEL_FILE -> Laravel
```

São protegidos `APP_KEY`, `DATABASE_URL`, `JWT_SECRET`, `MERCADO_PAGO_ACCESS_TOKEN`,
`MERCADO_PAGO_WEBHOOK_SECRET` e `SMTP_PASSWORD`. Dentro do container, a API
recebe apenas referências como
`DATABASE_URL_FILE=/run/secrets/database_url`.
O restante das configurações continua no ambiente do container.

O arquivo `.env` da VPS não muda de formato e continua sendo a fonte única das
configurações. Ele deve permanecer fora do Git e com acesso restrito no host.
Este projeto usa Docker Compose Secrets sem Swarm; a origem `environment` é
resolvida pelo Compose a partir do `.env`. A chave `VITE_MP_PUBLIC_KEY`
permanece pública porque é incorporada ao JavaScript entregue ao navegador.

Para adicionar outro gateway, implemente `PaymentGateway`, registre-o no `GatewayRegistry` e inclua seu nome em `PAYMENT_GATEWAY_ORDER`. O fallback só ocorre quando o adapter informa indisponibilidade antes de uma cobrança ser aceita. Recusas ou respostas ambíguas não são reenviadas automaticamente, evitando cobrança duplicada.

## Testes

```bash
# A imagem `test` da API traz PHP 8.5, pdo_pgsql e Xdebug (cobertura de branches
# exige Xdebug; pcov só mede linhas).
docker build --target test --build-arg API_PORT=8000 -t weslei-bassotto/api-ci:local api
API="docker run --rm -v $PWD/api:/app -w /app weslei-bassotto/api-ci:local"

$API composer install
$API composer gates            # formatação, análise estática e cobertura
$API composer lint:fix         # formata, no lugar de black + isort
$API composer analyse          # análise estática, no lugar do flake8
$API composer test:unit
$API composer test:integration
$API composer test:api
$API composer test:functional
$API composer test:regression
$API composer test:smoke

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

Cada lado é validado pelo seu próprio task runner, então não existe um terceiro
runtime só para orquestrar:

```bash
docker run --rm -v $PWD/api:/app -w /app weslei-bassotto/api-ci:local composer gates
npm --prefix frontend run gates
npm --prefix frontend run test:e2e
```

Ative uma vez o hook versionado, que executa exatamente esses alvos (menos o
E2E, que leva mais de dez minutos e fica com o Jenkins):

```bash
git config core.hooksPath .githooks
```

O hook é um shell script: chama `composer` dentro da imagem de testes e `npm` no
frontend. O workflow `.github/workflows/quality.yml` repete as validações em
todo push e pull request para `main` e `dev`, mesmo quando o hook local não
estiver instalado. O Jenkins permanece responsável pela validação final e pelo
deploy.

## Administradores iniciais

Nenhuma senha de administrador vive no ENV. Com `SEED_ON_START=true` e o banco
vazio, o seeder cria as roles e os administradores com uma senha placeholder e
`must_change_password`; a senha real é definida no primeiro acesso.

Depois da primeira carga, qualquer dado existente faz o seed ser ignorado. O
seeder usa `firstOrCreate`, então deploys futuros não reescrevem a senha
escolhida nem alteram roles e dados operacionais.

Para gerar um hash à mão: `php artisan platform:hash-password`.

## Webhook do Mercado Pago

Configure no painel do Mercado Pago:

```text
https://SEU_DOMINIO/api/v1/payments/webhooks/mercado_pago
```

Salve a assinatura secreta em `MERCADO_PAGO_WEBHOOK_SECRET`, com valores diferentes em desenvolvimento e produção. Consulte `.env.example` para a lista completa de variáveis.
