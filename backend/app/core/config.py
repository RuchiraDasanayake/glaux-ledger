from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# RFC 7518 s3.2: an HS256 key must be at least as long as the hash output.
MIN_JWT_SECRET_BYTES = 32

GENERATE_SECRET = 'python -c "import secrets; print(secrets.token_urlsafe(48))"'

# This used to be the default value of jwt_secret, so it is in this repository's history
# and in any .env copied from an older checkout. Anyone holding it can mint a token for
# any shop on a deployment still using it, which is why it is named here rather than
# quietly allowed through on length.
_PUBLISHED_SECRET = "insecure-development-default-please-override-in-env"

# Managed hosts (Railway, Render, Heroku, Fly) hand out bare "postgresql://" or the
# legacy "postgres://". SQLAlchemy resolves both to psycopg2, which is not installed --
# the failure is a ModuleNotFoundError at boot, nowhere near its actual cause.
_DRIVER = "postgresql+psycopg://"
_BARE_PREFIXES = ("postgresql://", "postgres://")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    # Runtime connection. Points at a NOSUPERUSER role so Postgres RLS is actually
    # enforced: superusers and BYPASSRLS roles silently ignore row security.
    database_url: str = (
        "postgresql+psycopg://glaux_app:glaux_dev_password@localhost:5432/glaux_ledger"
    )
    # Alembic connects as the table owner instead, since the app role cannot run DDL.
    migration_database_url: str | None = None
    # Used only by authenticated platform administration routes for cross-tenant work.
    # It must be an owner/superuser connection that can bypass tenant RLS.
    admin_database_url: str | None = None

    # Required, with no fallback of any kind. A default here is worse than a missing
    # value: the deploy succeeds, the app signs tokens with a key anyone can read out of
    # this repository, and nothing looks wrong until someone else's shop is being read.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    # A shop device should not get logged out mid-shift; see README for the tradeoff.
    jwt_expire_minutes: int = 60 * 24 * 14
    # Platform access can expose every payment submission, so it should not inherit the
    # long-lived shop-device session.
    admin_jwt_expire_minutes: int = 60 * 8

    # Comma-separated. Kept as a plain string because pydantic-settings would otherwise
    # demand JSON syntax for a list field in the environment.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    parser_provider: Literal["stub", "openai"] = "stub"
    openai_api_key: str | None = None
    openai_extract_model: str = "gpt-4o-mini"
    # Half the price of whisper-1 at 0.003/min, and better on code-switched speech,
    # which is most of what this hears.
    openai_transcribe_model: str = "gpt-4o-mini-transcribe"

    # Voice and photo entries per shop per calendar month. This is real money leaving a
    # prepaid account on a route any signed-in shop can call in a loop, and the loop does
    # not have to be malicious; a stuck retry will do. Sixteen a day is far past what a
    # counter generates and still costs under a dollar a month at current prices.
    ai_calls_per_month: int = 500

    max_upload_bytes: int = 10 * 1024 * 1024

    # Observability. Sentry stays off until a DSN is supplied, so nothing is reported
    # from a laptop or a test run.
    environment: str = "development"
    log_level: str = "INFO"
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

    # Rate limits, as a count and the window it applies over. See app/core/limiter.py.
    #
    # The two address-keyed limits are deliberately loose. A shop here works off the phone
    # behind the counter, and every mobile carrier in the country puts its subscribers
    # behind carrier-grade NAT, so one public address stands for a great many unrelated
    # shops. Tight limits keyed on an address punish whoever happens to share it, and the
    # refusal reaches someone who has done nothing and reads as the product being broken.
    login_rate_limit: int = 60
    login_rate_window_seconds: int = 60
    register_rate_limit: int = 40
    register_rate_window_seconds: int = 3600

    # The tight one, and the one that stops password guessing: failed sign-ins for a
    # single email. Eight is past any honest mistyping and far under what guessing needs,
    # and unlike an address it cannot be swapped for a fresh one.
    login_account_limit: int = 8
    login_account_window_seconds: int = 900

    upload_rate_limit: int = 20
    upload_rate_window_seconds: int = 60
    payment_submission_rate_limit: int = 5
    payment_submission_rate_window_seconds: int = 3600
    payment_evidence_max_bytes: int = 10 * 1024 * 1024

    @field_validator("database_url", "migration_database_url", "admin_database_url")
    @classmethod
    def _use_psycopg3(cls, value: str | None) -> str | None:
        if value is None:
            return None
        for prefix in _BARE_PREFIXES:
            if value.startswith(prefix):
                return _DRIVER + value.removeprefix(prefix)
        return value

    @field_validator("jwt_secret")
    @classmethod
    def _secret_is_usable(cls, value: str) -> str:
        if value.strip() == _PUBLISHED_SECRET:
            raise ValueError(
                "JWT_SECRET is the old development placeholder, which is published in "
                f"this repository. Generate a real one with: {GENERATE_SECRET}"
            )
        if len(value.encode()) < MIN_JWT_SECRET_BYTES:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_JWT_SECRET_BYTES} bytes. "
                f"Generate one with: {GENERATE_SECRET}"
            )
        return value

    @model_validator(mode="after")
    def _openai_needs_a_key(self) -> "Settings":
        """Caught at boot rather than on the first upload.

        Otherwise a deployment that sets PARSER_PROVIDER=openai and forgets the key looks
        healthy until a shopkeeper holds down the microphone, and then answers 503 to the
        one feature they were sold on.
        """
        if self.parser_provider == "openai" and not self.openai_api_key:
            raise ValueError("PARSER_PROVIDER is 'openai' but OPENAI_API_KEY is not set")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def alembic_url(self) -> str:
        return self.migration_database_url or self.database_url

    @property
    def privileged_url(self) -> str:
        return self.admin_database_url or self.alembic_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
