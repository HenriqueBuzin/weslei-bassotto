pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timeout(time: 60, unit: 'MINUTES')
    }

    stages {
        stage('Install') {
            parallel {
                stage('Backend') {
                    steps {
                        sh '''
                        set -e

                        # The image's test target already ships PHP 8.5, pdo_pgsql and
                        # Xdebug, so the toolchain is not assembled a second time here.
                        IMAGE="weslei-bassotto/api-ci:$(git rev-parse --short=12 HEAD)"
                        docker build --target test --build-arg API_PORT=8000 -t "$IMAGE" "$WORKSPACE/api"

                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE/api" \
                          "$IMAGE" \
                          sh -c '
                            set -e
                            cp .env.ci .env
                            trap "rm -f .env" EXIT
                            composer install --no-interaction --no-progress
                            composer gates
                          '
                        '''
                    }
                }

                stage('Frontend') {
                    steps {
                        sh '''
                        set -e

                        docker run --rm \
                          --volumes-from jenkins \
                          -e VITE_API_BASE=/api/v1 \
                          -e VITE_MP_PUBLIC_KEY=TEST-public-key \
                          -w "$WORKSPACE/frontend" \
                          node:24.18.1-bookworm-slim \
                          sh -c '
                            npm ci --no-audit --no-fund &&
                            npm run gates
                          '
                        '''
                    }
                }
            }
        }

        stage('Verify') {
            steps {
                sh '''
                set -e

                docker build \
                  --file "$WORKSPACE/frontend/Dockerfile.e2e" \
                  --tag weslei-bassotto-e2e:playwright-1.62.0-node-24.18.1 \
                  "$WORKSPACE/frontend"

                docker run --rm \
                  --ipc=host \
                  --volumes-from jenkins \
                  -w "$WORKSPACE/frontend" \
                  weslei-bassotto-e2e:playwright-1.62.0-node-24.18.1 \
                  sh -c '
                    npm ci --no-audit --no-fund &&
                    npm run test:e2e
                  '
                '''
            }
        }

        stage('Compose') {
            steps {
                script {
                    def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    branch = branch.replaceFirst(/^origin\//, '')
                    if (branch != 'main' && branch != 'dev') {
                        echo "Branch sem Compose de entrega: ${branch}"
                        return
                    }
                    withEnv(["PIPELINE_BRANCH=${branch}"]) {
                        sh '''
                            set -eu
                            suffix=""
                            stage_dir="prod"
                            if [ "$PIPELINE_BRANCH" = "dev" ]; then
                              suffix="-dev"
                              stage_dir="dev"
                            fi
                            env_file="/root/projects/envs/weslei-bassotto/${stage_dir}/weslei-bassotto${suffix}.env"
                            test -f "$env_file"
                            ln -sfn "$env_file" .env
                            if [ "$PIPELINE_BRANCH" = "main" ]; then
                              docker compose -f docker-compose-prod.yml config --quiet
                            else
                              docker compose -f docker-compose.yml config --quiet
                            fi
                        '''
                    }
                }
            }
        }

        stage('Container') {
            steps {
                script {
                    def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    branch = branch.replaceFirst(/^origin\//, '')
                    if (branch == 'main') {
                        sh 'IMAGE_TAG=$(git rev-parse --short=12 HEAD) docker compose -f docker-compose-prod.yml build'
                    } else if (branch == 'dev') {
                        sh 'IMAGE_TAG=$(git rev-parse --short=12 HEAD) docker compose -f docker-compose.yml build'
                    } else {
                        echo "Branch sem imagem de entrega: ${branch}"
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    def branch = env.BRANCH_NAME
                    def project = 'weslei-bassotto'

                    echo "🚀 Branch: ${branch}"

                    if (branch == 'main') {
                        sh """
                        set -e

                        workspace=\$(pwd)
                        target=/root/projects/${project}
                        image_tag=\$(git rev-parse --short=12 HEAD)
                        echo "🔄 Sincronizando checkout autenticado do Jenkins (main)..."
                        mkdir -p "\${target}"
                        find "\${target}" -mindepth 1 -maxdepth 1 \
                          ! -name '.git' \
                          ! -name '.env' \
                          -exec rm -rf {} +
                        tar -C "\${workspace}" \
                          --exclude='./.git' \
                          --exclude='./.env' \
                          --exclude='./api/.env' \
                          -cf - . | tar -C "\${target}" -xf -
                        cd "\${target}"

                        echo "🔗 Aplicando .env produção..."
                        ln -sfn /root/projects/envs/weslei-bassotto/prod/${project}.env .env
                        export COMPOSE_PROJECT_NAME=${project}
                        export IMAGE_TAG="\${image_tag}"

                        echo "🛑 Derrubando containers antigos..."
                        docker compose -f docker-compose-prod.yml down --remove-orphans || true

                        echo "🐳 Construindo produção..."
                        docker compose -f docker-compose-prod.yml build --no-cache

                        echo "🚀 Subindo produção..."
                        if ! docker compose -f docker-compose-prod.yml up -d --remove-orphans --wait --wait-timeout 180; then
                            echo "❌ Falha ao iniciar o ambiente de produção. Estado dos serviços:"
                            docker compose -f docker-compose-prod.yml ps || true
                            echo "📋 Logs recentes de todos os serviços:"
                            docker compose -f docker-compose-prod.yml logs --no-color --tail=200 || true
                            echo "🌐 Containers conectados à rede compartilhada do PostgreSQL:"
                            docker network inspect "\${POSTGRES_NETWORK:-postgres-network}" \
                                --format '{{range .Containers}}{{.Name}} {{end}}' || true
                            exit 1
                        fi

                        echo "📋 Verificando containers..."
                        docker compose -f docker-compose-prod.yml ps

                        echo "🧹 Limpando imagens antigas..."
                        docker image prune -f || true
                        """
                    } else if (branch == 'dev') {
                        sh """
                        set -e

                        workspace=\$(pwd)
                        target=/root/projects/${project}-dev
                        image_tag=\$(git rev-parse --short=12 HEAD)
                        echo "🔄 Sincronizando checkout autenticado do Jenkins (dev)..."
                        mkdir -p "\${target}"
                        find "\${target}" -mindepth 1 -maxdepth 1 \
                          ! -name '.git' \
                          ! -name '.env' \
                          -exec rm -rf {} +
                        tar -C "\${workspace}" \
                          --exclude='./.git' \
                          --exclude='./.env' \
                          --exclude='./api/.env' \
                          -cf - . | tar -C "\${target}" -xf -
                        cd "\${target}"

                        echo "🔗 Aplicando .env dev..."
                        ln -sfn /root/projects/envs/weslei-bassotto/dev/${project}-dev.env .env
                        export COMPOSE_PROJECT_NAME=${project}-dev
                        export IMAGE_TAG="\${image_tag}"

                        echo "🛑 Derrubando containers antigos..."
                        docker compose -f docker-compose.yml down --remove-orphans || true

                        echo "🐳 Construindo dev..."
                        docker compose -f docker-compose.yml build --no-cache

                        echo "🚀 Subindo dev..."
                        if ! docker compose -f docker-compose.yml up -d --remove-orphans --wait --wait-timeout 180; then
                            echo "❌ Falha ao iniciar o ambiente dev. Estado dos serviços:"
                            docker compose -f docker-compose.yml ps || true
                            echo "📋 Logs recentes de todos os serviços:"
                            docker compose -f docker-compose.yml logs --no-color --tail=200 || true
                            echo "🌐 Containers conectados à rede compartilhada do PostgreSQL:"
                            docker network inspect "\${POSTGRES_NETWORK:-postgres-network}" \
                                --format '{{range .Containers}}{{.Name}} {{end}}' || true
                            exit 1
                        fi

                        echo "📋 Verificando containers..."
                        docker compose -f docker-compose.yml ps

                        echo "🧹 Limpando imagens antigas..."
                        docker image prune -f || true
                        """
                    } else {
                        echo "⚠️ Branch ignorada: ${branch}"
                    }
                }
            }
        }
    }

    post {
        success {
            echo "✅ Pipeline e deploy OK - ${env.BRANCH_NAME}"
        }

        failure {
            echo "❌ Pipeline ou deploy FALHOU - ${env.BRANCH_NAME}"
        }

        always {
            echo "📦 Finalizado pipeline ${env.JOB_NAME}"
        }
    }
}
