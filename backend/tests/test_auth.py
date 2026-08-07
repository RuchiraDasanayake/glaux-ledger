from fastapi.testclient import TestClient

from app.services.seed import DEFAULT_CATEGORIES
from tests.conftest import Tenant, register_tenant


def test_register_creates_business_and_starter_categories(client: TestClient) -> None:
    tenant = register_tenant(client, "Nimal Stationers")
    names = {c["name"] for c in tenant.categories()}
    assert names == {name for name, _ in DEFAULT_CATEGORIES}
    assert tenant.get("/auth/me").json()["business"]["currency"] == "LKR"


def test_a_new_shop_can_record_costs_not_just_sales(client: TestClient) -> None:
    """The starter set must be usable for expenses out of the box.

    A single catch-all expense category would pass the assertion above while leaving the
    owner unable to tell rent from stock, which is most of the point of keeping a book.
    """
    tenant = register_tenant(client, "Kandy Copy House")
    expense_names = {c["name"] for c in tenant.categories() if c["type"] == "expense"}
    assert {"Stock & Supplies", "Utilities", "Rent", "Wages"} <= expense_names


def test_register_defaults_to_colombo_time(client: TestClient) -> None:
    tenant = register_tenant(client, "Colombo Copy Centre")
    assert tenant.get("/auth/me").json()["business"]["timezone"] == "Asia/Colombo"


def test_register_rejects_unknown_timezone(client: TestClient) -> None:
    response = client.post(
        "/auth/register",
        json={
            "business_name": "Nowhere Shop",
            "email": "nowhere@example.com",
            "password": "a-sufficiently-long-password",
            "timezone": "Mars/Olympus_Mons",
        },
    )
    assert response.status_code == 422


def test_duplicate_email_is_rejected(client: TestClient, alpha: Tenant) -> None:
    response = client.post(
        "/auth/register",
        json={
            "business_name": "Impostor",
            "email": alpha.email,
            "password": "a-sufficiently-long-password",
        },
    )
    assert response.status_code == 409


def test_login_returns_a_usable_token(client: TestClient, alpha: Tenant) -> None:
    response = client.post(
        "/auth/login", json={"email": alpha.email, "password": "a-sufficiently-long-password"}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_login_with_wrong_password_is_rejected(client: TestClient, alpha: Tenant) -> None:
    response = client.post("/auth/login", json={"email": alpha.email, "password": "nope"})
    assert response.status_code == 401


def test_unknown_email_and_wrong_password_are_indistinguishable(
    client: TestClient, alpha: Tenant
) -> None:
    unknown = client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope"})
    wrong = client.post("/auth/login", json={"email": alpha.email, "password": "nope"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_protected_route_requires_a_token(client: TestClient) -> None:
    assert client.get("/categories").status_code == 401


def test_garbage_token_is_rejected(client: TestClient) -> None:
    response = client.get("/categories", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
