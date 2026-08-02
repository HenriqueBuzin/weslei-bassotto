import importlib

import pytest
from pydantic import ValidationError

from app.core.settings import Settings, load_file_secrets


def valid_settings(_settings_class=Settings, _drop=(), **overrides):
    values = {
        "API_BASE": "api/v1/",
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/weslei_bassotto_test",
        "APP_ENV": "dev",
        "JWT_ALG": "hs256",
        "JWT_SECRET": "a-secret-that-is-longer-than-thirty-two-characters",
        "ACCESS_TOKEN_EXPIRES_MINUTES": 30,
        "REFRESH_TOKEN_EXPIRES_SHORT_HOURS": 8,
        "REFRESH_TOKEN_EXPIRES_LONG_DAYS": 30,
        "CORS_ALLOWED_ORIGINS": ["https://example.com"],
        "SEED_ON_START": False,
        "ADMIN_ACCOUNTS": [],
        "COOKIE_DOMAIN": "",
        "COOKIE_SECURE": False,
        "COOKIE_SAMESITE": "lax",
        "REFRESH_COOKIE_NAME": "rt_test",
        "REFRESH_COOKIE_PATH": "api/v1/auth",
    }
    for name in _drop:
        values.pop(name, None)
    values.update(overrides)
    return _settings_class(_env_file=None, **values)


def test_settings_normalize_values():
    settings = valid_settings(
        CORS_ALLOWED_ORIGINS="https://one.test, https://two.test",
        PAYMENT_GATEWAY_ORDER="first, second",
    )
    assert settings.api_base == "/api/v1"
    assert settings.database_url.startswith("postgresql://")
    assert settings.cors_allowed_origins == ["https://one.test", "https://two.test"]
    assert settings.payment_gateway_order == ["first", "second"]
    assert settings.refresh_cookie_path == "/api/v1/auth"
    assert settings.cookie_domain is None
    assert settings.configured_admin_accounts == []
    assert settings.is_dev and not settings.is_prod
    assert settings.ACCESS_TOKEN_EXPIRES.total_seconds() == 1800
    assert settings.REFRESH_TOKEN_EXPIRES_SHORT.total_seconds() == 28800
    assert settings.REFRESH_TOKEN_EXPIRES_LONG.total_seconds() == 2592000


def test_admin_accounts_array_takes_precedence_and_prod_requires_two():
    accounts = [
        {"email": "ADMIN1@example.com", "password": "secret-one"},
        {"email": "admin2@example.com", "password": "secret-two"},
    ]
    settings = valid_settings(APP_ENV="prod", ADMIN_ACCOUNTS=accounts)
    assert settings.is_prod and not settings.is_dev
    assert [item["email"] for item in settings.configured_admin_accounts] == [
        "admin1@example.com",
        "admin2@example.com",
    ]
    with pytest.raises(ValidationError, match="exatamente dois administradores"):
        valid_settings(APP_ENV="prod", ADMIN_ACCOUNTS=accounts[:1])


def test_sensitive_settings_can_be_loaded_from_file_environment(tmp_path):
    secrets = {
        "JWT_SECRET": "secret-file-value-with-at-least-thirty-two-characters",
        "ADMIN_ACCOUNTS": (
            '[{"email":"admin1@example.com","password":"secret-one"},'
            '{"email":"admin2@example.com","password":"secret-two"}]'
        ),
        "MERCADO_PAGO_ACCESS_TOKEN": "mp-access-token",
        "MERCADO_PAGO_WEBHOOK_SECRET": "mp-webhook-secret",
        "SMTP_PASSWORD": "gmail-app-password",
    }
    environ = {}
    connection = "postgresql://secret-user:secret-pass@postgres:5432/weslei"
    connection_file = tmp_path / "database_url"
    connection_file.write_text(f"{connection}\n", encoding="utf-8")
    environ["DATABASE_URL_FILE"] = str(connection_file)
    for name, value in secrets.items():
        secret_file = tmp_path / name.lower()
        secret_file.write_text(f"{value}\n", encoding="utf-8")
        environ[f"{name}_FILE"] = str(secret_file)

    loaded = load_file_secrets(environ)
    settings = valid_settings(
        _drop=("DATABASE_URL", "JWT_SECRET", "ADMIN_ACCOUNTS"),
        **loaded,
        APP_ENV="prod",
    )

    assert set(loaded) == {"DATABASE_URL"} | {name for name, value in secrets.items() if value}
    assert settings.database_url == connection
    assert settings.jwt_secret == secrets["JWT_SECRET"]
    assert len(settings.configured_admin_accounts) == 2
    assert settings.mercado_pago_access_token == "mp-access-token"
    assert settings.mercado_pago_webhook_secret == "mp-webhook-secret"
    assert settings.smtp_password == "gmail-app-password"


def test_file_secret_loader_ignores_missing_file_variables():
    assert (
        load_file_secrets(
            {
                "DATABASE_URL_FILE": "/run/secrets/missing-database",
                "JWT_SECRET_FILE": "/run/secrets/not-mounted",
            }
        )
        == {}
    )


def test_database_url_secret_ignores_empty_file(tmp_path):
    database_file = tmp_path / "database_url"
    database_file.write_text("\n", encoding="utf-8")
    jwt_file = tmp_path / "jwt_secret"
    jwt_file.write_text("\n", encoding="utf-8")

    assert load_file_secrets({"DATABASE_URL_FILE": str(database_file), "JWT_SECRET_FILE": str(jwt_file)}) == {}


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"JWT_ALG": "none"}, "JWT_ALG"),
        ({"JWT_SECRET": "short"}, "muito curto"),
        ({"APP_ENV": "staging"}, "APP_ENV"),
        ({"DATABASE_URL": ""}, "DATABASE_URL"),
        ({"COOKIE_SAMESITE": "invalid"}, "COOKIE_SAMESITE"),
        ({"REFRESH_COOKIE_NAME": "bad name"}, "REFRESH_COOKIE_NAME"),
        ({"COOKIE_SAMESITE": "none", "COOKIE_SECURE": False}, "COOKIE_SECURE"),
    ],
)
def test_invalid_security_settings_are_rejected(override, message):
    with pytest.raises(ValidationError, match=message):
        valid_settings(**override)


def test_parsers_accept_json_wildcard_empty_and_fallback_values(monkeypatch):
    assert Settings._split_or_parse_origins('["https://one.test"]') == ["https://one.test"]
    assert Settings._split_or_parse_origins("*") == ["*"]
    assert Settings._split_or_parse_origins("") == []
    assert Settings._split_or_parse_origins("[broken") == ["[broken"]
    assert Settings._split_or_parse_origins('{"origin":"https://one.test"}') == ['{"origin":"https://one.test"}']
    settings_module = importlib.import_module("app.core.settings")
    monkeypatch.setattr(settings_module.json, "loads", lambda value: {"not": "a list"})
    assert Settings._split_or_parse_origins("[valid-looking]") == ["[valid-looking]"]
    assert Settings._parse_gateway_order(None) == ["mercado_pago"]
    assert Settings._normalize_api_base("") == "/"
    assert Settings._norm_cookie_path("") == "/"


def test_asymmetric_algorithms_require_a_nonempty_secret():
    settings = valid_settings(JWT_ALG="RS256", JWT_SECRET="public-key-placeholder")
    assert settings.jwt_alg == "RS256"
    with pytest.raises(ValidationError, match="não pode ser vazio"):
        valid_settings(JWT_ALG="ES256", JWT_SECRET="")
