import os
import uuid
from dataclasses import dataclass

import pytest

# Must be set before anything under app/ is imported: the engine is built from settings
# at import time. Environment variables outrank the .env file in pydantic-settings, so
# this redirects the whole test run onto a scratch database.
TEST_DB = "glaux_ledger_test"
_HOST = "localhost:5432"
OWNER_URL = f"postgresql+psycopg://glaux:glaux_dev_password@{_HOST}/{TEST_DB}"
APP_URL = f"postgresql+psycopg://glaux_app:glaux_dev_password@{_HOST}/{TEST_DB}"
MAINTENANCE_URL = f"postgresql+psycopg://glaux:glaux_dev_password@{_HOST}/postgres"

os.environ["DATABASE_URL"] = APP_URL
os.environ["MIGRATION_DATABASE_URL"] = OWNER_URL
os.environ["JWT_SECRET"] = "test-only-secret-long-enough-to-satisfy-rfc-7518-hs256"
os.environ["PARSER_PROVIDER"] = "stub"

# The limiter stays switched on for every test: it is a dependency on four routes and
# should be exercised by all of them, but every request in the suite arrives from the
# same TestClient address, so the real limits are lifted out of the way. test_limiter.py
# puts them back down for the tests that are about the limiter itself.
os.environ["LOGIN_RATE_LIMIT"] = "100000"
os.environ["LOGIN_ACCOUNT_LIMIT"] = "100000"
os.environ["REGISTER_RATE_LIMIT"] = "100000"
os.environ["UPLOAD_RATE_LIMIT"] = "100000"

from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from alembic import command  # noqa: E402
from app.main import app  # noqa: E402

TENANT_TABLES = (
    "payment_submissions",
    "platform_users",
    "transactions",
    "categories",
    "users",
    "businesses",
)


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    maintenance = create_engine(MAINTENANCE_URL, isolation_level="AUTOCOMMIT")
    with maintenance.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{TEST_DB}" OWNER glaux'))
    maintenance.dispose()

    # Mirrors docker/postgres/init/01-app-role.sql, which only ran against the dev
    # database. Without it the unprivileged role could not touch the new tables.
    owner = create_engine(OWNER_URL, isolation_level="AUTOCOMMIT")
    with owner.connect() as conn:
        conn.execute(text("GRANT CONNECT ON DATABASE glaux_ledger_test TO glaux_app"))
        conn.execute(text("GRANT USAGE ON SCHEMA public TO glaux_app"))
        conn.execute(
            text(
                "ALTER DEFAULT PRIVILEGES FOR ROLE glaux IN SCHEMA public "
                "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glaux_app"
            )
        )
    owner.dispose()

    command.upgrade(Config("alembic.ini"), "head")
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    # TRUNCATE is not subject to row security, so the owner can reset between tests.
    owner = create_engine(OWNER_URL, isolation_level="AUTOCOMMIT")
    with owner.connect() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(TENANT_TABLES)} CASCADE"))
    owner.dispose()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@dataclass
class Tenant:
    """A registered business plus a client that authenticates as its owner."""

    client: TestClient
    business_id: str
    token: str
    email: str

    def get(self, url: str, **kwargs):
        return self.client.get(url, headers=self._headers, **kwargs)

    def post(self, url: str, **kwargs):
        return self.client.post(url, headers=self._headers, **kwargs)

    def patch(self, url: str, **kwargs):
        return self.client.patch(url, headers=self._headers, **kwargs)

    def delete(self, url: str, **kwargs):
        return self.client.delete(url, headers=self._headers, **kwargs)

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def categories(self, **params) -> list[dict]:
        return self.get("/categories", params=params).json()

    def category_id(self, name: str) -> str:
        return next(c["id"] for c in self.categories(include_archived=True) if c["name"] == name)

    def set_billing(self, *, trial_days: float, paid_through: str | None = None) -> None:
        """Move this shop's subscription dates. Negative trial_days means expired.

        Written straight to the row rather than through an endpoint, because there is no
        endpoint: payment is collected by hand and applied with mark_paid.py.
        """
        owner = create_engine(OWNER_URL, isolation_level="AUTOCOMMIT")
        with owner.connect() as conn:
            conn.execute(
                text(
                    "UPDATE businesses SET trial_ends_at = now() + make_interval(secs => :secs), "
                    "paid_through = CAST(:paid AS date) WHERE id = CAST(:id AS uuid)"
                ),
                {"secs": trial_days * 86400, "paid": paid_through, "id": self.business_id},
            )
        owner.dispose()

    def add_transaction(self, category_name: str, amount: str, note: str | None = None, **extra):
        return self.post(
            "/transactions",
            json={
                "category_id": self.category_id(category_name),
                "amount": amount,
                "note": note,
                **extra,
            },
        )


def register_tenant(client: TestClient, name: str) -> Tenant:
    slug = "".join(ch if ch.isalnum() else "-" for ch in name.lower())
    email = f"{slug}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/auth/register",
        json={"business_name": name, "email": email, "password": "a-sufficiently-long-password"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return Tenant(
        client=client,
        business_id=body["business"]["id"],
        token=body["access_token"],
        email=email,
    )


@pytest.fixture
def alpha(client: TestClient) -> Tenant:
    return register_tenant(client, "Alpha Stationers")


@pytest.fixture
def beta(client: TestClient) -> Tenant:
    return register_tenant(client, "Beta Printers")
