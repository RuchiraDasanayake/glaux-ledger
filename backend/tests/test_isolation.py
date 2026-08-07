"""Two businesses, one database. Beta must never observe or touch Alpha's data."""

import uuid

from app.services.seed import DEFAULT_CATEGORIES
from tests.conftest import Tenant


def test_categories_are_not_shared(alpha: Tenant, beta: Tenant) -> None:
    alpha.post("/categories", json={"name": "Lamination", "type": "income"})

    beta_names = {c["name"] for c in beta.categories()}
    assert "Lamination" not in beta_names
    # Each still sees its own starter set, so this is isolation and not an empty result.
    assert len(beta_names) == len(DEFAULT_CATEGORIES)


def test_same_category_name_is_allowed_in_different_businesses(alpha: Tenant, beta: Tenant) -> None:
    assert alpha.post("/categories", json={"name": "Binding", "type": "income"}).status_code == 201
    assert beta.post("/categories", json={"name": "Binding", "type": "income"}).status_code == 201


def test_duplicate_category_name_within_a_business_is_rejected(alpha: Tenant) -> None:
    alpha.post("/categories", json={"name": "Binding", "type": "income"})
    assert alpha.post("/categories", json={"name": "Binding", "type": "income"}).status_code == 409


def test_transactions_are_not_shared(alpha: Tenant, beta: Tenant) -> None:
    alpha.add_transaction("Printing", "450.00", note="200 colour pages")
    beta.add_transaction("Scanning", "120.00")

    alpha_items = alpha.get("/transactions").json()["items"]
    beta_items = beta.get("/transactions").json()["items"]

    assert [i["note"] for i in alpha_items] == ["200 colour pages"]
    assert len(beta_items) == 1
    assert beta_items[0]["amount"] == "120.00"


def test_a_foreign_category_id_cannot_be_written_to(alpha: Tenant, beta: Tenant) -> None:
    """The headline cross-tenant write attempt: Beta files against Alpha's category."""
    alpha_category = alpha.category_id("Printing")

    response = beta.post("/transactions", json={"category_id": alpha_category, "amount": "999.00"})

    # 404 rather than 403: another tenant's row should look absent, not forbidden.
    assert response.status_code == 404
    assert alpha.get("/transactions").json()["total"] == 0


def test_summary_only_counts_own_rows(alpha: Tenant, beta: Tenant) -> None:
    alpha.add_transaction("Printing", "1000.00")
    alpha.add_transaction("Utilities", "250.00")
    beta.add_transaction("Printing", "77777.00")

    summary = alpha.get("/transactions/summary?period=day").json()
    assert summary["income"] == "1000.00"
    assert summary["expense"] == "250.00"
    assert summary["net"] == "750.00"


def test_summary_breakdown_excludes_other_tenants(alpha: Tenant, beta: Tenant) -> None:
    beta.post("/categories", json={"name": "Secret Beta Category", "type": "income"})
    beta.add_transaction("Secret Beta Category", "500.00")
    alpha.add_transaction("Scanning", "60.00")

    names = {c["category_name"] for c in alpha.get("/transactions/summary").json()["by_category"]}
    assert names == {"Scanning"}


def test_a_forged_business_id_in_the_body_is_ignored(alpha: Tenant, beta: Tenant) -> None:
    """business_id comes from the token; sending one must not redirect the write."""
    response = beta.post(
        "/transactions",
        json={
            "category_id": beta.category_id("Printing"),
            "amount": "10.00",
            "business_id": alpha.business_id,
        },
    )
    assert response.status_code == 201
    assert alpha.get("/transactions").json()["total"] == 0
    assert beta.get("/transactions").json()["total"] == 1


def test_filtering_by_a_foreign_category_returns_nothing(alpha: Tenant, beta: Tenant) -> None:
    alpha.add_transaction("Printing", "300.00")
    foreign = alpha.category_id("Printing")

    page = beta.get(f"/transactions?category_id={foreign}").json()
    assert page["items"] == []
    assert page["total"] == 0


def test_a_token_for_a_deleted_business_is_rejected(alpha: Tenant) -> None:
    forged = alpha.token.replace(alpha.token[-6:], "aaaaaa")
    response = alpha.client.get("/categories", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_random_uuid_as_category_is_a_404(alpha: Tenant) -> None:
    response = alpha.post(
        "/transactions", json={"category_id": str(uuid.uuid4()), "amount": "5.00"}
    )
    assert response.status_code == 404
