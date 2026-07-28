#!/bin/sh
set -eu

environment=${1:?use: rollback-compose.sh <prod|dev> <image-tag>}
export IMAGE_TAG=${2:?use: rollback-compose.sh <prod|dev> <image-tag>}

case "$environment" in
  prod)
    export COMPOSE_PROJECT_NAME=weslei-bassotto
    set -- -f docker-compose.prod.yml
    ;;
  dev)
    export COMPOSE_PROJECT_NAME=weslei-bassotto-dev
    set -- -f docker-compose.yml
    ;;
  *)
    echo "environment must be prod or dev" >&2
    exit 2
    ;;
esac

docker compose "$@" up -d --no-build --remove-orphans --wait
