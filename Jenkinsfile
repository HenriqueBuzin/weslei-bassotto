pipeline {
    agent any

    options {
        disableConcurrentBuilds()
    }

    stages {
        stage('Tests') {
            parallel {
                stage('Backend') {
                    steps {
                        sh '''
                        set -e

                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE/api" \
                          python:3.14-slim \
                          sh -c '
                            pip install -q poetry==2.4.1 &&
                            poetry config virtualenvs.create false &&
                            poetry install --no-interaction &&
                            poetry run black --check . &&
                            poetry run isort --check-only . &&
                            poetry run flake8 . &&
                            poetry run pytest \
                              --cov=app \
                              --cov-branch \
                              --cov-report=term-missing \
                              --cov-fail-under=100 \
                              -q
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
                          -w "$WORKSPACE/frontend" \
                          node:24-bookworm-slim \
                          sh -c '
                            npm ci --no-audit --no-fund &&
                            npm run format:check &&
                            npm run lint &&
                            npm run test:coverage &&
                            npm run build
                          '
                        '''
                    }
                }
            }
        }

        stage('E2E') {
            steps {
                sh '''
                set -e

                docker build \
                  --file "$WORKSPACE/frontend/Dockerfile.e2e" \
                  --tag weslei-bassotto-e2e:playwright-1.61.1-node-24.18.0 \
                  "$WORKSPACE/frontend"

                docker run --rm \
                  --ipc=host \
                  --volumes-from jenkins \
                  -w "$WORKSPACE/frontend" \
                  weslei-bassotto-e2e:playwright-1.61.1-node-24.18.0 \
                  sh -c '
                    npm ci --no-audit --no-fund &&
                    npm run test:e2e
                  '
                '''
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

                        cd /root/projects/${project}

                        echo "🔄 Atualizando código (main)..."
                        git fetch origin
                        git reset --hard origin/main
                        git clean -fd

                        echo "🔗 Aplicando .env produção..."
                        ln -sfn /root/projects/envs/${project}.env .env

                        echo "🛑 Derrubando containers antigos..."
                        docker compose --profile prod down --remove-orphans || true

                        echo "🐳 Construindo produção..."
                        docker compose --profile prod build --no-cache

                        echo "🚀 Subindo produção..."
                        docker compose --profile prod up -d --remove-orphans

                        echo "📋 Verificando containers..."
                        docker compose --profile prod ps

                        echo "🧹 Limpando imagens antigas..."
                        docker image prune -af || true
                        """
                    } else if (branch == 'dev') {
                        sh """
                        set -e

                        cd /root/projects/${project}-dev

                        echo "🔄 Atualizando código (dev)..."
                        git fetch origin
                        git reset --hard origin/dev
                        git clean -fd

                        echo "🔗 Aplicando .env dev..."
                        ln -sfn /root/projects/envs/${project}-dev.env .env

                        echo "🛑 Derrubando containers antigos..."
                        docker compose --profile dev down --remove-orphans || true

                        echo "🐳 Construindo dev..."
                        docker compose --profile dev build --no-cache

                        echo "🚀 Subindo dev..."
                        if ! docker compose --profile dev up -d --remove-orphans; then
                            echo "❌ Falha ao iniciar o ambiente dev. Estado dos serviços:"
                            docker compose --profile dev ps || true
                            echo "📋 Logs recentes da API:"
                            docker compose --profile dev logs --no-color --tail=200 api_dev || true
                            echo "🌐 Containers conectados à rede compartilhada do PostgreSQL:"
                            docker network inspect "\${POSTGRES_NETWORK:-postgres-network}" \
                                --format '{{range .Containers}}{{.Name}} {{end}}' || true
                            exit 1
                        fi

                        echo "📋 Verificando containers..."
                        docker compose --profile dev ps

                        echo "🧹 Limpando imagens antigas..."
                        docker image prune -af || true
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
