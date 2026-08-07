from datetime import UTC, datetime, timedelta

from tests.conftest import Tenant


def _days_ago(count: int) -> str:
    return (datetime.now(UTC) - timedelta(days=count)).isoformat()


def test_the_window_is_continuous(alpha: Tenant) -> None:
    """Every day is present, including the ones with nothing on them.

    The query behind this only returns days that have entries. A chart drawn from those
    alone puts Monday next to Thursday at equal spacing and silently rewrites the week.
    """
    response = alpha.get("/transactions/daily?days=7")

    assert response.status_code == 200
    body = response.json()
    assert len(body["points"]) == 7
    assert body["points"][-1]["day"] == body["end_date"]
    assert body["points"][0]["day"] == body["start_date"]

    days = [point["day"] for point in body["points"]]
    assert days == sorted(days)


def test_a_quiet_day_is_a_zero_not_a_gap(alpha: Tenant) -> None:
    alpha.add_transaction("Printing", "450.00")

    points = alpha.get("/transactions/daily?days=5").json()["points"]

    assert points[-1]["income"] == "450.00"
    assert [p["income"] for p in points[:-1]] == ["0.00"] * 4
    assert [p["net"] for p in points[:-1]] == ["0.00"] * 4


def test_entries_land_on_the_day_they_occurred(alpha: Tenant) -> None:
    alpha.add_transaction("Printing", "300.00", occurred_at=_days_ago(2))
    alpha.add_transaction("Utilities", "125.00")

    points = alpha.get("/transactions/daily?days=4").json()["points"]

    # Index 1 of a four-day window ending today is two days back.
    assert points[1]["income"] == "300.00"
    assert points[1]["net"] == "300.00"
    assert points[-1]["expense"] == "125.00"
    assert points[-1]["net"] == "-125.00"


def test_a_voided_entry_leaves_the_chart(alpha: Tenant) -> None:
    created = alpha.add_transaction("Printing", "800.00").json()
    alpha.post(f"/transactions/{created['id']}/void")

    points = alpha.get("/transactions/daily?days=2").json()["points"]

    assert points[-1]["income"] == "0.00"


def test_another_shop_is_not_in_the_series(alpha: Tenant, beta: Tenant) -> None:
    beta.add_transaction("Printing", "99999.00")
    alpha.add_transaction("Printing", "10.00")

    points = alpha.get("/transactions/daily?days=2").json()["points"]

    assert points[-1]["income"] == "10.00"


def test_a_lapsed_shop_can_still_see_its_trend(alpha: Tenant) -> None:
    """Reads stay open forever. The chart is a read."""
    alpha.add_transaction("Printing", "70.00")
    alpha.set_billing(trial_days=-1)

    assert alpha.get("/transactions/daily").status_code == 200


def test_an_unreasonable_window_is_refused(alpha: Tenant) -> None:
    assert alpha.get("/transactions/daily?days=400").status_code == 422
    assert alpha.get("/transactions/daily?days=1").status_code == 422


def test_the_series_requires_authentication(client) -> None:
    assert client.get("/transactions/daily").status_code == 401
