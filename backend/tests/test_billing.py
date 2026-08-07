"""The subscription gate.

Two things are being pinned down here. The obvious one is that a lapsed shop cannot
write. The one that matters more is the second half of every test file below the fold: a
lapsed shop can still read and export everything it ever recorded. That is a deliberate
product decision, not an oversight, and it is the kind of decision that quietly rots the
first time someone adds a dependency to a GET route, so it is tested.
"""

from datetime import date, timedelta

from mark_paid import add_months
from tests.conftest import Tenant

TODAY = date.today()


def _yesterday() -> str:
    return (TODAY - timedelta(days=1)).isoformat()


def _next_month() -> str:
    return (TODAY + timedelta(days=30)).isoformat()


def test_new_shop_is_trialing_for_thirty_days(alpha: Tenant) -> None:
    business = alpha.get("/auth/me").json()["business"]
    assert business["status"] == "trialing"
    assert business["paid_through"] is None
    # 29 rather than 30: the countdown floors, and a few milliseconds have passed.
    assert business["trial_days_left"] == 29


def test_trialing_shop_can_write(alpha: Tenant) -> None:
    assert alpha.add_transaction("Printing", "1200.00").status_code == 201


def test_expired_trial_lapses(alpha: Tenant) -> None:
    alpha.set_billing(trial_days=-1)
    assert alpha.get("/auth/me").json()["business"]["status"] == "lapsed"


def test_payment_makes_a_lapsed_shop_active(alpha: Tenant) -> None:
    alpha.set_billing(trial_days=-400, paid_through=_next_month())
    business = alpha.get("/auth/me").json()["business"]
    assert business["status"] == "active"
    assert alpha.add_transaction("Printing", "500.00").status_code == 201


def test_paid_through_today_still_counts(alpha: Tenant) -> None:
    """Inclusive. A shop paid through the 31st is not cut off on the morning of the 31st."""
    alpha.set_billing(trial_days=-400, paid_through=TODAY.isoformat())
    assert alpha.get("/auth/me").json()["business"]["status"] == "active"


def test_expired_payment_lapses_again(alpha: Tenant) -> None:
    alpha.set_billing(trial_days=-400, paid_through=_yesterday())
    assert alpha.get("/auth/me").json()["business"]["status"] == "lapsed"


def test_payment_outranks_an_unexpired_trial(alpha: Tenant) -> None:
    """Both dates valid resolves to active, so an early payer is never shown a countdown."""
    alpha.set_billing(trial_days=10, paid_through=_next_month())
    assert alpha.get("/auth/me").json()["business"]["status"] == "active"


def test_lapsed_shop_cannot_write(alpha: Tenant) -> None:
    sales = alpha.category_id("Printing")
    entry = alpha.add_transaction("Printing", "300.00").json()
    alpha.set_billing(trial_days=-1)

    blocked = [
        alpha.post("/transactions", json={"category_id": sales, "amount": "10.00"}),
        alpha.patch(f"/transactions/{entry['id']}", json={"amount": "11.00"}),
        alpha.post(f"/transactions/{entry['id']}/void"),
        alpha.post(f"/transactions/{entry['id']}/settle"),
        alpha.post("/categories", json={"name": "Catering", "type": "income"}),
        alpha.patch(f"/categories/{sales}", json={"name": "Counter sales"}),
        alpha.post("/transactions/from-voice", files={"file": ("a.webm", b"x", "audio/webm")}),
        alpha.post("/transactions/from-photo", files={"file": ("a.jpg", b"x", "image/jpeg")}),
    ]
    assert [r.status_code for r in blocked] == [402] * len(blocked)


def test_lapsed_shop_keeps_its_records(alpha: Tenant) -> None:
    """The whole point. Losing access to your own books is not a pricing tactic."""
    alpha.add_transaction("Printing", "4500.00", note="Counter takings")
    alpha.set_billing(trial_days=-1)

    listed = alpha.get("/transactions")
    assert listed.status_code == 200
    assert listed.json()["items"][0]["note"] == "Counter takings"

    assert alpha.get("/transactions/summary", params={"period": "month"}).status_code == 200
    assert alpha.get("/categories").status_code == 200
    assert alpha.get("/transactions/counterparties").status_code == 200

    export = alpha.get(
        "/reports/export",
        params={"from_date": _yesterday(), "to_date": TODAY.isoformat()},
    )
    assert export.status_code == 200
    assert export.headers["content-type"] == "application/pdf"


def test_one_shop_lapsing_does_not_affect_another(alpha: Tenant, beta: Tenant) -> None:
    alpha.set_billing(trial_days=-1)
    assert alpha.add_transaction("Printing", "10.00").status_code == 402
    assert beta.add_transaction("Printing", "10.00").status_code == 201


def test_paying_does_not_unlock_another_shops_rows(alpha: Tenant, beta: Tenant) -> None:
    """The gate is orthogonal to isolation, and adding it must not have crossed the two."""
    theirs = beta.add_transaction("Printing", "900.00").json()["id"]
    alpha.set_billing(trial_days=-400, paid_through=_next_month())

    assert alpha.patch(f"/transactions/{theirs}", json={"amount": "1.00"}).status_code == 404
    assert alpha.post(f"/transactions/{theirs}/void").status_code == 404


def test_a_month_from_the_end_of_a_long_one_clamps() -> None:
    """Otherwise every January hands out three free days, and February two more."""
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert add_months(date(2026, 3, 31), 1) == date(2026, 4, 30)
    assert add_months(date(2026, 12, 15), 1) == date(2027, 1, 15)
    assert add_months(date(2026, 6, 1), 12) == date(2027, 6, 1)
