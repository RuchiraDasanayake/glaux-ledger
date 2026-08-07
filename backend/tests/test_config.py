"""Settings validation, which mostly exists to make deployment failures legible."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

LONG_ENOUGH_SECRET = "x" * 32


def build(**overrides: str | None) -> Settings:
    # _env_file=None keeps a developer's real .env out of these assertions.
    return Settings(_env_file=None, jwt_secret=LONG_ENOUGH_SECRET, **overrides)


@pytest.mark.parametrize(
    "given",
    [
        "postgresql://u:p@host:5432/db",
        "postgres://u:p@host:5432/db",
    ],
)
def test_bare_postgres_urls_get_the_psycopg3_driver(given: str) -> None:
    """Managed hosts hand out these, and SQLAlchemy would resolve them to psycopg2."""
    assert build(database_url=given).database_url == "postgresql+psycopg://u:p@host:5432/db"


def test_an_explicit_driver_is_left_alone() -> None:
    url = "postgresql+asyncpg://u:p@host/db"
    assert build(database_url=url).database_url == url


def test_the_migration_url_is_normalised_too() -> None:
    settings = build(
        database_url="postgresql://app:p@host/db",
        migration_database_url="postgres://owner:p@host/db",
    )
    assert settings.migration_database_url == "postgresql+psycopg://owner:p@host/db"
    assert settings.alembic_url == settings.migration_database_url


def test_alembic_falls_back_to_the_runtime_url() -> None:
    """Hosts that only give you one role should still work."""
    settings = build(database_url="postgresql://solo:p@host/db", migration_database_url=None)
    assert settings.alembic_url == "postgresql+psycopg://solo:p@host/db"


def test_a_short_jwt_secret_is_refused() -> None:
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        Settings(_env_file=None, jwt_secret="too-short")


def test_a_missing_jwt_secret_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """No default, deliberately. The alternative is a deploy that boots and signs tokens
    with a key published in this repository.

    The env var has to be unset explicitly: conftest exports one for the whole run, and
    pydantic-settings reads the environment even with `_env_file=None`.
    """
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError, match="jwt_secret"):
        Settings(_env_file=None)


def test_the_old_published_default_is_refused_by_name() -> None:
    """Long enough to pass the length check, and in every older .env and git object."""
    with pytest.raises(ValidationError, match="published in this repository"):
        Settings(_env_file=None, jwt_secret="insecure-development-default-please-override-in-env")


def test_choosing_openai_without_a_key_is_refused_at_boot() -> None:
    with pytest.raises(ValidationError, match="OPENAI_API_KEY is not set"):
        build(parser_provider="openai", openai_api_key=None)


def test_choosing_openai_with_a_key_is_fine() -> None:
    assert build(parser_provider="openai", openai_api_key="sk-x").parser_provider == "openai"


def test_cors_origins_split_and_strip() -> None:
    settings = build(cors_origins=" https://a.example , https://b.example ,")
    assert settings.cors_origin_list == ["https://a.example", "https://b.example"]
