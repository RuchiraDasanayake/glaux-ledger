from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import PlatformUser
from tests.conftest import OWNER_URL, Tenant


@pytest.fixture
def reviewer(client) -> dict[str, str]:
    engine = create_engine(OWNER_URL)
    with Session(engine) as session:
        session.add(
            PlatformUser(
                email="ops@example.com",
                hashed_password=hash_password("a-strong-review-password"),
                role="admin",
            )
        )
        session.commit()
    engine.dispose()

    response = client.post(
        "/admin/auth/login",
        json={"email": "ops@example.com", "password": "a-strong-review-password"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_overview_and_shop_controls(alpha: Tenant, beta: Tenant, reviewer: dict[str, str], client) -> None:
    alpha.set_billing(trial_days=-5)
    overview = client.get("/admin/overview", headers=reviewer)
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["shops_total"] >= 2
    assert body["shops_lapsed"] >= 1

    shops = client.get("/admin/shops?status=lapsed", headers=reviewer)
    assert shops.status_code == 200
    emails = {row["owner_email"] for row in shops.json()}
    assert alpha.email in emails

    shop_id = next(row["id"] for row in shops.json() if row["owner_email"] == alpha.email)
    extended = client.post(
        f"/admin/shops/{shop_id}/extend",
        headers=reviewer,
        json={"months": 1},
    )
    assert extended.status_code == 200, extended.text
    assert extended.json()["status"] == "active"
    assert extended.json()["paid_through"] is not None

    suspended = client.post(f"/admin/shops/{shop_id}/suspend", headers=reviewer)
    assert suspended.status_code == 200
    assert suspended.json()["disabled_at"] is not None

    blocked = alpha.post(
        "/transactions",
        json={
            "amount": "10.00",
            "entry_type": "expense",
            "category_id": alpha.categories["expense"][0]["id"],
            "occurred_at": datetime.now(UTC).isoformat(),
        },
    )
    assert blocked.status_code == 403

    restored = client.post(f"/admin/shops/{shop_id}/unsuspend", headers=reviewer)
    assert restored.status_code == 200
    assert restored.json()["disabled_at"] is None

    search = client.get("/admin/shops?q=beta", headers=reviewer)
    assert search.status_code == 200
    assert any(row["owner_email"] == beta.email for row in search.json())


def test_search_is_case_insensitive(alpha: Tenant, reviewer: dict[str, str], client) -> None:
    fragment = alpha.email.split("@")[0][:4].upper()
    response = client.get(f"/admin/shops?q={fragment}", headers=reviewer)
    assert response.status_code == 200
    assert any(row["owner_email"] == alpha.email for row in response.json())
