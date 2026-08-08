# syntax=docker/dockerfile:1.7-labs

# --- Stage comum: extensões e Composer ---
FROM php:8.5.9-cli-alpine AS vendor

ENV TZ=America/Sao_Paulo \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1

# OPcache is compiled into PHP 8.5, so only pdo_pgsql is built here; asking
# docker-php-ext-install for opcache fails with "can't stat 'modules/*'".
RUN apk add --no-cache postgresql-dev libsodium-dev icu-dev $PHPIZE_DEPS \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2.10.1 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json composer.lock /app/
RUN --mount=type=cache,target=/tmp/composer \
    COMPOSER_CACHE_DIR=/tmp/composer composer install \
    --no-dev --no-scripts --no-autoloader --prefer-dist

COPY . /app

# --no-scripts on purpose: package:discover boots the app, and the app validates
# its environment, but DATABASE_URL and friends are runtime secrets that do not
# exist yet at build time. The entrypoint warms the caches once they are mounted.
RUN composer dump-autoload --optimize --no-dev --no-scripts


# --- Desenvolvimento: artisan serve sobre o código montado ---
FROM php:8.5.9-cli-alpine AS dev

ENV TZ=America/Sao_Paulo \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1

RUN apk add --no-cache postgresql-dev libsodium-dev icu-dev $PHPIZE_DEPS \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2.10.1 /usr/bin/composer /usr/bin/composer

WORKDIR /app

ARG API_PORT
RUN test -n "$API_PORT" || (echo "Defina --build-arg API_PORT" && exit 1)
ENV API_PORT=${API_PORT}
EXPOSE ${API_PORT}

# PHP is interpreted, so the bind mounted source reloads on every request.
CMD ["sh","-lc",": ${API_PORT:?Defina API_PORT}; \
    composer install --no-interaction; \
    php artisan migrate --force; \
    php artisan platform:seed; \
    exec php artisan serve --host=0.0.0.0 --port=\"${API_PORT}\""]


# --- Testes: mesma imagem de dev com Xdebug ligado para cobertura ---
FROM dev AS test

ENV XDEBUG_MODE=coverage

# Branch coverage needs Xdebug; pcov only reports lines.
RUN apk add --no-cache linux-headers $PHPIZE_DEPS     && pecl channel-update pecl.php.net     && pecl install xdebug     && docker-php-ext-enable xdebug     && apk del $PHPIZE_DEPS

CMD ["sh","-lc","composer install --no-interaction && vendor/bin/phpunit"]


# --- Produção: PHP-FPM atrás do Caddy ---
FROM php:8.5.9-fpm-alpine AS prod

ENV TZ=America/Sao_Paulo

# OPcache is compiled into PHP 8.5, so only pdo_pgsql is built here; asking
# docker-php-ext-install for opcache fails with "can't stat 'modules/*'".
RUN apk add --no-cache postgresql-dev libsodium-dev icu-dev $PHPIZE_DEPS \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql \
    && apk del $PHPIZE_DEPS

# Compiled once at build time: the code never changes inside the image.
RUN { \
      echo 'opcache.enable=1'; \
      echo 'opcache.validate_timestamps=0'; \
      echo 'opcache.memory_consumption=192'; \
      echo 'opcache.max_accelerated_files=20000'; \
      echo 'opcache.jit=tracing'; \
      echo 'opcache.jit_buffer_size=64M'; \
    } > /usr/local/etc/php/conf.d/opcache.ini \
    && { \
      echo 'expose_php=0'; \
      echo 'display_errors=0'; \
      echo 'memory_limit=256M'; \
    } > /usr/local/etc/php/conf.d/hardening.ini

WORKDIR /app

COPY --from=vendor /app /app

RUN chown -R www-data:www-data /app/storage /app/bootstrap/cache

ARG API_PORT
RUN test -n "$API_PORT" || (echo "Defina --build-arg API_PORT" && exit 1)
ENV API_PORT=${API_PORT}
EXPOSE ${API_PORT}

# Caddy talks FastCGI to this port; route/config caches are built at boot so the
# runtime secrets are already mounted.
#
# `listen` is a pool directive, not a php.ini one, so `php-fpm -d listen=...` was
# silently ignored and FPM stayed on the stock 9000 while Caddy dialled API_PORT.
# Writing a pool file is what actually moves it; zz- sorts after docker.conf.
CMD ["sh","-lc",": ${API_PORT:?Defina API_PORT}; \
    printf '[www]\nlisten = 0.0.0.0:%s\n' \"${API_PORT}\" > /usr/local/etc/php-fpm.d/zz-listen.conf; \
    php artisan migrate --force; \
    php artisan platform:seed; \
    php artisan config:cache; \
    php artisan route:cache; \
    php artisan event:cache; \
    exec php-fpm --nodaemonize"]


# --- Scheduler de dev: mesmo target dev, só trocando o processo ---
FROM dev AS dev-scheduler

# Herda de dev e não de prod porque o compose de desenvolvimento monta o código
# por cima de /app; a imagem de produção traz o vendor embutido e o mount o
# esconderia.
#
# Sem composer install de propósito: os dois containers compartilham o volume de
# vendor, e instalar nos dois ao mesmo tempo faz um apagar os pacotes que o outro
# está gravando ("Could not delete /app/vendor/doctrine"). O compose espera o
# backend ficar saudável, o que só acontece depois do install dele.
CMD ["sh","-lc","exec php artisan schedule:work"]


# --- Scheduler de produção: mesma imagem de prod, só trocando o processo ---
FROM prod AS scheduler

# routes/console.php agenda platform:prune, mas nada o dispara: o container de
# produção sobe apenas o PHP-FPM. Este processo é quem faz o agendamento valer.
# Não roda migrate nem os caches: o serviço backend já cuidou disso.
CMD ["sh","-lc","exec php artisan schedule:work"]
