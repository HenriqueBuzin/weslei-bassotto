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

                docker run --rm \
                  --ipc=host \
                  --volumes-from jenkins \
                  -w "$WORKSPACE/frontend" \
                  mcr.microsoft.com/playwright:v1.61.1-noble \
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
                        docker compose --profile prod down || true

                        echo "🐳 Construindo produção..."
                        docker compose --profile prod build --no-cache

                        echo "🚀 Subindo produção..."
                        docker compose --profile prod up -d

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
                        docker compose --profile dev down || true

                        echo "🐳 Construindo dev..."
                        docker compose --profile dev build --no-cache

                        echo "🚀 Subindo dev..."
                        docker compose --profile dev up -d

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
            echo "✅ Deploy OK - ${env.BRANCH_NAME}"
        }

        failure {
            echo "❌ Pipeline FALHOU - ${env.BRANCH_NAME}"
        }

        always {
            echo "📦 Finalizado pipeline ${env.JOB_NAME}"
        }
    }
}