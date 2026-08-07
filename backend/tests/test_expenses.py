"""What a shop needs beyond a sales log: costs, corrections, and money still owed."""

from datetime import UTC, datetime, timedelta

from tests.conftest import Tenant

# --- backdating -----------------------------------------------------------------


def test_an_entry_can_be_dated_to_when_the_money_moved(alpha: Tenant) -> None:
    """A bill paid on Monday and typed in on Friday belongs to Monday.

    Before occurred_at existed, created_at served both purposes and the bill landed on
    whichever day the owner got round to entering it.
    """
    monday = datetime.now(UTC) - timedelta(days=4)
    response = alpha.add_transaction("Utilities", "3200.00", occurred_at=monday.isoformat())

    assert response.status_code == 201
    body = response.json()
    assert body["occurred_at"].startswith(monday.date().isoformat())
    # The audit trail still records when it was actually typed.
    assert body["created_at"].startswith(datetime.now(UTC).date().isoformat())


def test_a_backdated_entry_leaves_todays_total_alone(alpha: Tenant) -> None:
    old = (datetime.now(UTC) - timedelta(days=6)).isoformat()
    alpha.add_transaction("Rent", "15000.00", occurred_at=old)
    alpha.add_transaction("Printing", "450.00")

    today = alpha.get("/transactions/summary?period=day").json()
    assert today["expense"] == "0.00"
    assert today["income"] == "450.00"


def test_a_future_date_is_refused(alpha: Tenant) -> None:
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert alpha.add_transaction("Rent", "100.00", occurred_at=tomorrow).status_code == 422


# --- credit and what is owed ------------------------------------------------------


def test_a_credit_purchase_is_recorded_as_unsettled(alpha: Tenant) -> None:
    response = alpha.add_transaction(
        "Stock & Supplies", "18000.00", settled=False, counterparty="City Paper", due_date=None
    )
    body = response.json()
    assert body["settled"] is False
    assert body["settled_at"] is None
    assert body["counterparty"] == "City Paper"


def test_outstanding_totals_what_is_still_owed(alpha: Tenant) -> None:
    alpha.add_transaction("Stock & Supplies", "18000.00", settled=False)
    alpha.add_transaction("Utilities", "3200.00", settled=False)
    alpha.add_transaction("Rent", "15000.00")  # paid, so not owed

    summary = alpha.get("/transactions/summary").json()
    assert summary["outstanding_payable"] == "21200.00"
    assert summary["outstanding_receivable"] == "0.00"


def test_what_is_owed_ignores_the_reporting_window(alpha: Tenant) -> None:
    """A bill from two months ago is still owed today.

    Windowing this would hide exactly the debts most worth chasing.
    """
    long_ago = (datetime.now(UTC) - timedelta(days=60)).isoformat()
    alpha.add_transaction("Stock & Supplies", "9000.00", settled=False, occurred_at=long_ago)

    summary = alpha.get("/transactions/summary?period=day").json()
    assert summary["expense"] == "0.00"  # outside today
    assert summary["outstanding_payable"] == "9000.00"  # still owed


def test_an_overdue_bill_is_counted(alpha: Tenant) -> None:
    yesterday = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    alpha.add_transaction("Utilities", "3200.00", settled=False, due_date=yesterday)

    assert alpha.get("/transactions/summary").json()["overdue_count"] == 1


def test_settling_clears_it_from_what_is_owed(alpha: Tenant) -> None:
    created = alpha.add_transaction("Stock & Supplies", "18000.00", settled=False).json()

    settled = alpha.post(f"/transactions/{created['id']}/settle")
    assert settled.status_code == 200
    assert settled.json()["settled"] is True

    assert alpha.get("/transactions/summary").json()["outstanding_payable"] == "0.00"


def test_an_unsettled_filter_lists_only_open_bills(alpha: Tenant) -> None:
    alpha.add_transaction("Stock & Supplies", "18000.00", settled=False)
    alpha.add_transaction("Rent", "15000.00")

    page = alpha.get("/transactions?settled=false").json()
    assert page["total"] == 1
    assert page["items"][0]["amount"] == "18000.00"


# --- corrections ------------------------------------------------------------------


def test_a_wrong_amount_can_be_corrected(alpha: Tenant) -> None:
    created = alpha.add_transaction("Printing", "45000.00").json()

    fixed = alpha.patch(f"/transactions/{created['id']}", json={"amount": "4500.00"})
    assert fixed.status_code == 200
    assert fixed.json()["amount"] == "4500.00"
    assert alpha.get("/transactions/summary").json()["income"] == "4500.00"


def test_moving_an_entry_to_another_category_moves_its_direction(alpha: Tenant) -> None:
    """entry_type follows the category on an edit, exactly as it does on create."""
    created = alpha.add_transaction("Printing", "900.00").json()
    assert created["entry_type"] == "income"

    moved = alpha.patch(
        f"/transactions/{created['id']}",
        json={"category_id": alpha.category_id("Stock & Supplies")},
    )
    assert moved.json()["entry_type"] == "expense"


def test_an_untouched_field_survives_an_edit(alpha: Tenant) -> None:
    created = alpha.add_transaction("Printing", "900.00", note="20 colour pages").json()
    edited = alpha.patch(f"/transactions/{created['id']}", json={"amount": "950.00"}).json()
    assert edited["note"] == "20 colour pages"


def test_voiding_removes_an_entry_from_the_totals(alpha: Tenant) -> None:
    created = alpha.add_transaction("Printing", "450.00").json()
    alpha.add_transaction("Printing", "300.00")

    assert alpha.post(f"/transactions/{created['id']}/void").status_code == 200

    assert alpha.get("/transactions/summary").json()["income"] == "300.00"
    assert alpha.get("/transactions").json()["total"] == 1


def test_a_voided_entry_is_kept_on_the_record(alpha: Tenant) -> None:
    """Soft, not deleted: a book that silently loses rows cannot be audited."""
    created = alpha.add_transaction("Printing", "450.00").json()
    alpha.post(f"/transactions/{created['id']}/void")

    page = alpha.get("/transactions?include_voided=true").json()
    assert page["total"] == 1
    assert page["items"][0]["voided"] is True


def test_voided_entries_stay_out_of_the_breakdown(alpha: Tenant) -> None:
    created = alpha.add_transaction("Scanning", "150.00").json()
    alpha.post(f"/transactions/{created['id']}/void")

    assert alpha.get("/transactions/summary").json()["by_category"] == []


def test_another_tenants_entry_cannot_be_edited_or_voided(alpha: Tenant, beta: Tenant) -> None:
    created = alpha.add_transaction("Printing", "450.00").json()

    assert beta.patch(f"/transactions/{created['id']}", json={"amount": "1.00"}).status_code == 404
    assert beta.post(f"/transactions/{created['id']}/void").status_code == 404
    assert alpha.get("/transactions").json()["total"] == 1


# --- comparison against the period before ------------------------------------------


def test_the_previous_period_is_reported_for_comparison(alpha: Tenant) -> None:
    yesterday = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    alpha.add_transaction("Printing", "1000.00", occurred_at=yesterday)
    alpha.add_transaction("Printing", "1500.00")

    summary = alpha.get("/transactions/summary?period=day").json()
    assert summary["net"] == "1500.00"
    assert summary["previous_net"] == "1000.00"


# --- categories --------------------------------------------------------------------


def test_a_category_can_be_renamed(alpha: Tenant) -> None:
    category_id = alpha.category_id("Other Expense")
    renamed = alpha.patch(f"/categories/{category_id}", json={"name": "Sundries"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Sundries"


def test_renaming_onto_an_existing_name_is_refused(alpha: Tenant) -> None:
    category_id = alpha.category_id("Other Expense")
    assert alpha.patch(f"/categories/{category_id}", json={"name": "Rent"}).status_code == 409


def test_archiving_hides_a_category_without_losing_its_history(alpha: Tenant) -> None:
    alpha.add_transaction("Scanning", "150.00")
    category_id = alpha.category_id("Scanning")

    assert alpha.patch(f"/categories/{category_id}", json={"archived": True}).status_code == 200

    assert "Scanning" not in {c["name"] for c in alpha.categories()}
    assert "Scanning" in {c["name"] for c in alpha.categories(include_archived=True)}
    # The entry filed under it is untouched and still named.
    assert alpha.get("/transactions").json()["items"][0]["category"]["name"] == "Scanning"


def test_an_archived_category_cannot_take_new_entries(alpha: Tenant) -> None:
    category_id = alpha.category_id("Scanning")
    alpha.patch(f"/categories/{category_id}", json={"archived": True})

    assert alpha.add_transaction("Scanning", "150.00").status_code == 409


def test_archiving_is_reversible(alpha: Tenant) -> None:
    category_id = alpha.category_id("Transport")
    alpha.patch(f"/categories/{category_id}", json={"archived": True})
    alpha.patch(f"/categories/{category_id}", json={"archived": False})

    assert "Transport" in {c["name"] for c in alpha.categories()}


def test_another_tenants_category_cannot_be_renamed(alpha: Tenant, beta: Tenant) -> None:
    category_id = alpha.category_id("Printing")
    assert beta.patch(f"/categories/{category_id}", json={"name": "Stolen"}).status_code == 404
