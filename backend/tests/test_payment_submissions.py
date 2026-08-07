from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core import limiter
from app.core.config import settings
from app.core.security import hash_password
from app.models import PlatformUser
from tests.conftest import OWNER_URL, Tenant

PDF = b"%PDF-1.4\nbank slip\n%%EOF"


@pytest.fixture
def reviewer(client) -> dict[str, str]:
    engine = create_engine(OWNER_URL)
    with Session(engine) as session:
        session.add(
            PlatformUser(
                email="reviewer@example.com",
                hashed_password=hash_password("a-strong-review-password"),
                role="reviewer",
            )
        )
        session.commit()
    engine.dispose()

    response = client.post(
        "/admin/auth/login",
        json={"email": "reviewer@example.com", "password": "a-strong-review-password"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _submit(tenant: Tenant, payload: bytes = PDF, mime: str = "application/pdf"):
    return tenant.post(
        "/billing/payment-submissions",
        data={
            "amount": "2500.00",
            "transfer_date": date.today().isoformat(),
            "transfer_reference": "BANK-123",
        },
        files={"evidence": ("slip.pdf", payload, mime)},
    )


def test_lapsed_shop_can_submit_and_list_payment(alpha: Tenant) -> None:
    alpha.set_billing(trial_days=-10)
    created = _submit(alpha)
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending"
    assert created.json()["evidence_mime"] == "application/pdf"

    listed = alpha.get("/billing/payment-submissions")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [created.json()["id"]]


def test_evidence_type_is_detected_from_bytes(alpha: Tenant) -> None:
    response = _submit(alpha, payload=b"not a jpeg", mime="image/jpeg")
    assert response.status_code == 415


def test_empty_and_oversized_evidence_are_rejected(
    alpha: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert _submit(alpha, payload=b"").status_code == 422
    monkeypatch.setattr(settings, "payment_evidence_max_bytes", 8)
    assert _submit(alpha).status_code == 413


def test_submissions_are_rate_limited_per_shop(
    alpha: Tenant, beta: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    limiter.reset()
    monkeypatch.setattr(settings, "payment_submission_rate_limit", 1)
    try:
        assert _submit(alpha).status_code == 201
        assert _submit(alpha).status_code == 429
        assert _submit(beta).status_code == 201
    finally:
        limiter.reset()


def test_shop_can_retrieve_only_its_own_evidence(alpha: Tenant, beta: Tenant) -> None:
    submission_id = _submit(beta).json()["id"]
    assert alpha.get(f"/billing/payment-submissions/{submission_id}/evidence").status_code == 404
    evidence = beta.get(f"/billing/payment-submissions/{submission_id}/evidence")
    assert evidence.status_code == 200
    assert evidence.content == PDF


def test_admin_approval_is_cross_tenant_atomic_and_idempotent(
    alpha: Tenant, client, reviewer: dict[str, str]
) -> None:
    alpha.set_billing(trial_days=-400)
    submission_id = _submit(alpha).json()["id"]

    listed = client.get("/admin/payment-submissions", headers=reviewer)
    assert listed.status_code == 200
    assert listed.json()[0]["business_id"] == alpha.business_id

    first = client.post(
        f"/admin/payment-submissions/{submission_id}/approve",
        headers=reviewer,
        json={"months": 1, "note": "Bank statement matched"},
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "approved"
    paid_through = first.json()["paid_through"]

    repeated = client.post(
        f"/admin/payment-submissions/{submission_id}/approve",
        headers=reviewer,
        json={"months": 12},
    )
    assert repeated.status_code == 200
    assert repeated.json()["paid_through"] == paid_through
    assert alpha.get("/auth/me").json()["business"]["paid_through"] == paid_through


def test_shop_and_admin_tokens_are_not_interchangeable(
    alpha: Tenant, client, reviewer: dict[str, str]
) -> None:
    assert alpha.get("/admin/payment-submissions").status_code == 401
    assert client.get("/auth/me", headers=reviewer).status_code == 401


def test_capabilities_discloses_behavior_not_provider(alpha: Tenant) -> None:
    response = alpha.get("/capabilities")
    assert response.status_code == 200
    assert response.json() == {"ai_parsing_enabled": False}
