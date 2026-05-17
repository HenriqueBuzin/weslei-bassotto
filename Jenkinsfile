pipeline {
    agent any

    options {
        disableConcurrentBuilds() // evita conflito de deploy
    }

    stages {
        stage('Deploy') {
            steps {
                script {

                    // branch atual do multibranch
                    def branch = env.BRANCH_NAME
                    def project = "weslei-bassotto"

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
                        ln -sf /root/envs/${project}.env .env

                        echo "🛑 Derrubando containers antigos..."
                        docker compose --profile prod down || true

                        echo "🐳 Subindo produção..."
                        docker compose --profile prod up -d --build

                        echo "🧹 Limpando imagens antigas..."
                        docker image prune -af || true
                        """
                    }

                    else if (branch == 'dev') {

                        sh """
                        set -e

                        cd /root/projects/${project}-dev

                        echo "🔄 Atualizando código (dev)..."
                        git fetch origin
                        git reset --hard origin/dev
                        git clean -fd

                        echo "🔗 Aplicando .env dev..."
                        ln -sf /root/envs/${project}-dev.env .env

                        echo "🛑 Derrubando containers antigos..."
                        docker compose --profile dev down || true

                        echo "🐳 Subindo dev..."
                        docker compose --profile dev up -d --build

                        echo "🧹 Limpando imagens antigas..."
                        docker image prune -af || true
                        """
                    }

                    else {
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
            echo "❌ Deploy FALHOU - ${env.BRANCH_NAME}"
        }

        always {
            echo "📦 Finalizado pipeline ${env.JOB_NAME}"
        }
    }
}
