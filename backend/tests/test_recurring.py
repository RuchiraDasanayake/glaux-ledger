from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from tests.conftest import Tenant

COLOMBO = ZoneInfo("Asia/Colombo")


def _today() -> date:
    return datetime.now(COLOMBO).date()


def _a_day_already_passed() -> int:
    """A day-of-month that has arrived, so a bill dated to it is due now.

    The first eight days of a month have no such day, so those runs use the 1st and
    accept that "already passed" means "is today".
    """
    return max(1, min(_today().day, 28))


def _a_day_still_ahead() -> int | None:
    """A day-of-month that has not arrived yet, or None near the end of a month."""
    tomorrow = _today().day + 1
    return tomorrow if tomorrow <= 28 else None


def add_bill(tenant: Tenant, **overrides):
    payload = {
        "category_id": tenant.category_id("Rent"),
        "name": "Shop rent",
        "amount": "35000.00",
        "day_of_month": _a_day_already_passed(),
        "counterparty": "M. Perera",
        "payment_method": "bank",
        "note": "Shop rent",
    }
    payload.update(overrides)
    return tenant.post("/recurring", json=payload)


def test_a_bill_is_created_and_listed(alpha: Tenant) -> None:
    created = add_bill(alpha)
    assert created.status_code == 201, created.text

    bills = alpha.get("/recurring").json()
    assert [bill["name"] for bill in bills] == ["Shop rent"]
    assert bills[0]["category"]["name"] == "Rent"
    assert bills[0]["amount"] == "35000.00"


def test_a_bill_whose_day_has_arrived_is_due(alpha: Tenant) -> None:
    add_bill(alpha)
    assert alpha.get("/recurring").json()[0]["due"] is True


@pytest.mark.skipif(_a_day_still_ahead() is None, reason="no later day left in this month")
def test_a_bill_later_this_month_is_not_due_yet(alpha: Tenant) -> None:
    add_bill(alpha, day_of_month=_a_day_still_ahead())
    assert alpha.get("/recurring").json()[0]["due"] is False


def test_recording_it_stops_it_being_due(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()

    recorded = alpha.post(f"/recurring/{bill['id']}/record", json={})

    assert recorded.status_code == 201, recorded.text
    assert recorded.json()["amount"] == "35000.00"
    assert recorded.json()["counterparty"] == "M. Perera"

    after = alpha.get("/recurring").json()[0]
    assert after["recorded_this_month"] is True
    assert after["due"] is False


def test_the_amount_can_be_corrected_at_the_moment_of_recording(alpha: Tenant) -> None:
    """An electricity bill is never the same twice, which is why these are offered."""
    bill = add_bill(alpha, name="Electricity", amount="6000.00").json()

    recorded = alpha.post(f"/recurring/{bill['id']}/record", json={"amount": "7250.00"})

    assert recorded.json()["amount"] == "7250.00"
    # The template keeps its usual figure.
    assert alpha.get("/recurring").json()[0]["amount"] == "6000.00"


def test_it_can_be_recorded_unsettled(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()
    recorded = alpha.post(f"/recurring/{bill['id']}/record", json={"settled": False}).json()
    assert recorded["settled"] is False


def test_recording_it_twice_in_a_month_is_refused(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()
    alpha.post(f"/recurring/{bill['id']}/record", json={})

    again = alpha.post(f"/recurring/{bill['id']}/record", json={})

    assert again.status_code == 409
    assert "already been recorded" in again.json()["detail"]


def test_voiding_the_entry_makes_the_bill_due_again(alpha: Tenant) -> None:
    """Correcting a mistake must not leave the shop thinking the rent is paid."""
    bill = add_bill(alpha).json()
    entry = alpha.post(f"/recurring/{bill['id']}/record", json={}).json()

    alpha.post(f"/transactions/{entry['id']}/void")

    assert alpha.get("/recurring").json()[0]["due"] is True
    assert alpha.post(f"/recurring/{bill['id']}/record", json={}).status_code == 201


def test_last_months_entry_does_not_settle_this_month(alpha: Tenant) -> None:
    add_bill(alpha)
    last_month = datetime.now(UTC) - timedelta(days=35)
    alpha.post(
        "/transactions",
        json={
            "category_id": alpha.category_id("Rent"),
            "amount": "35000.00",
            "occurred_at": last_month.isoformat(),
        },
    )

    assert alpha.get("/recurring").json()[0]["due"] is True


def test_a_paused_bill_is_never_due(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()

    alpha.patch(f"/recurring/{bill['id']}", json={"active": False})

    listed = alpha.get("/recurring").json()[0]
    assert listed["active"] is False
    assert listed["due"] is False


def test_paused_bills_can_be_left_out_of_the_list(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()
    alpha.patch(f"/recurring/{bill['id']}", json={"active": False})

    assert alpha.get("/recurring", params={"include_paused": False}).json() == []


def test_a_bill_can_be_edited(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()

    updated = alpha.patch(
        f"/recurring/{bill['id']}",
        json={"amount": "40000.00", "name": "Shop rent (new lease)"},
    ).json()

    assert updated["amount"] == "40000.00"
    assert updated["name"] == "Shop rent (new lease)"


def test_deleting_a_bill_leaves_its_entries_alone(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()
    entry = alpha.post(f"/recurring/{bill['id']}/record", json={}).json()

    assert alpha.delete(f"/recurring/{bill['id']}").status_code == 204
    assert alpha.get("/recurring").json() == []

    listed = alpha.get("/transactions").json()["items"]
    assert [item["id"] for item in listed] == [entry["id"]]


def test_the_entry_is_dated_to_the_day_the_bill_fell_due(alpha: Tenant) -> None:
    """Rent confirmed three days late is still that month's rent."""
    bill = add_bill(alpha, day_of_month=1).json()

    entry = alpha.post(f"/recurring/{bill['id']}/record", json={}).json()

    occurred = datetime.fromisoformat(entry["occurred_at"]).astimezone(COLOMBO).date()
    assert occurred == _today().replace(day=1)


def test_a_future_due_day_is_never_dated_forward(alpha: Tenant) -> None:
    """The ledger refuses future entries everywhere else; this is not an exception."""
    ahead = _a_day_still_ahead()
    if ahead is None:
        pytest.skip("no later day left in this month")
    bill = add_bill(alpha, day_of_month=ahead).json()

    entry = alpha.post(f"/recurring/{bill['id']}/record", json={}).json()

    occurred = datetime.fromisoformat(entry["occurred_at"]).astimezone(COLOMBO).date()
    assert occurred == _today()


def test_a_day_february_does_not_have_is_refused(alpha: Tenant) -> None:
    """29 to 31 would silently skip a month, which is worse than refusing the input."""
    assert add_bill(alpha, day_of_month=29).status_code == 422
    assert add_bill(alpha, day_of_month=0).status_code == 422


def test_a_retired_category_cannot_be_used(alpha: Tenant) -> None:
    category_id = alpha.category_id("Rent")
    alpha.patch(f"/categories/{category_id}", json={"archived": True})

    assert add_bill(alpha).status_code == 409


def test_another_shops_bill_is_invisible(alpha: Tenant, beta: Tenant) -> None:
    bill = add_bill(beta).json()

    assert alpha.get("/recurring").json() == []
    assert alpha.patch(f"/recurring/{bill['id']}", json={"amount": "1.00"}).status_code == 404
    assert alpha.post(f"/recurring/{bill['id']}/record", json={}).status_code == 404


def test_a_lapsed_shop_can_read_its_bills_but_not_record_them(alpha: Tenant) -> None:
    bill = add_bill(alpha).json()
    alpha.set_billing(trial_days=-1)

    assert alpha.get("/recurring").status_code == 200
    assert alpha.post(f"/recurring/{bill['id']}/record", json={}).status_code == 402
    assert add_bill(alpha).status_code == 402


def test_recurring_requires_authentication(client) -> None:
    assert client.get("/recurring").status_code == 401
