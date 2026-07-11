from copy import deepcopy
import importlib

import pytest
from pydantic import ValidationError

from app.core.settings import Settings


def valid_settings(**overrides):
    values = {
        "API_BASE": "api/v1/",
        "MONGO_URI": "mongodb://localhost/test",
        "APP_ENV": "dev",
        "JWT_ALG": "hs256",
        "JWT_SECRET": "a-secret-that-is-longer-than-thirty-two-characters",
        "ACCESS_TOKEN_EXPIRES_MINUTES": 30,
        "REFRESH_TOKEN_EXPIRES_SHORT_HOURS": 8,
        "REFRESH_TOKEN_EXPIRES_LONG_DAYS": 30,
        "CORS_ALLOWED_ORIGINS": ["https://example.com"],
        "SEED_ON_START": False,
        "ADMIN_EMAIL": None,
        "ADMIN_PASSWORD": None,
        "ADMIN_ACCOUNTS": [],
        "COOKIE_DOMAIN": "",
        "COOKIE_SECURE": False,
        "COOKIE_SAMESITE": "lax",
        "REFRESH_COOKIE_NAME": "rt_test",
        "REFRESH_COOKIE_PATH": "api/v1/auth",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_settings_normalize_values_and_legacy_admin():
    settings = valid_settings(
        CORS_ALLOWED_ORIGINS="https://one.test, https://two.test",
        PAYMENT_GATEWAY_ORDER="first, second",
        ADMIN_EMAIL="ADMIN@EXAMPLE.COM",
        ADMIN_PASSWORD="secret123",
    )
    assert settings.api_base == "/api/v1"
    assert settings.cors_allowed_origins == ["https://one.test", "https://two.test"]
    assert settings.payment_gateway_order == ["first", "second"]
    assert settings.refresh_cookie_path == "/api/v1/auth"
    assert settings.cookie_domain is None
    assert settings.configured_admin_accounts == [{"email": "admin@example.com", "password": "secret123"}]
    assert settings.is_dev and not settings.is_prod
    assert settings.ACCESS_TOKEN_EXPIRES.total_seconds() == 1800
    assert settings.REFRESH_TOKEN_EXPIRES_SHORT.total_seconds() == 28800
    assert settings.REFRESH_TOKEN_EXPIRES == settings.REFRESH_TOKEN_EXPIRES_LONG


def test_admin_accounts_array_takes_precedence_and_prod_requires_two():
    accounts = [
        {"email": "ADMIN1@example.com", "password": "secret-one"},
        {"email": "admin2@example.com", "password": "secret-two"},
    ]
    settings = valid_settings(APP_ENV="prod", ADMIN_ACCOUNTS=accounts)
    assert settings.is_prod and not settings.is_dev
    assert [item["email"] for item in settings.configured_admin_accounts] == [
        "admin1@example.com", "admin2@example.com"
    ]
    with pytest.raises(ValidationError, match="exatamente dois administradores"):
        valid_settings(APP_ENV="prod", ADMIN_ACCOUNTS=accounts[:1])


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"JWT_ALG": "none"}, "JWT_ALG"),
        ({"JWT_SECRET": "short"}, "muito curto"),
        ({"APP_ENV": "staging"}, "APP_ENV"),
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
