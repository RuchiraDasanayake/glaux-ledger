import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.repositories.transaction import CategoryTotal
from app.services.pdf import build_cashflow_report
from app.services.periods import window_from_dates
from tests.conftest import Tenant


def _range() -> str:
    today = date.today()
    return f"from_date={today - timedelta(days=7)}&to_date={today}"


def test_export_returns_a_pdf(alpha: Tenant) -> None:
    alpha.add_transaction("Printing", "450.00", note="200 colour pages")
    alpha.add_transaction("Utilities", "120.00")

    response = alpha.get(f"/reports/export?{_range()}")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    assert "attachment" in response.headers["content-disposition"]


def test_export_works_with_no_entries(alpha: Tenant) -> None:
    """An empty period must produce an empty report, not a 500."""
    response = alpha.get(f"/reports/export?{_range()}")
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


def test_export_covers_only_this_business(alpha: Tenant, beta: Tenant) -> None:
    beta.add_transaction("Printing", "99999.00")
    alpha.add_transaction("Printing", "10.00")

    alpha_pdf = alpha.get(f"/reports/export?{_range()}").content
    # Amounts are drawn as text, so a leaked figure would be findable in the stream.
    assert b"99,999" not in alpha_pdf


def test_reversed_dates_are_rejected(alpha: Tenant) -> None:
    response = alpha.get("/reports/export?from_date=2026-08-01&to_date=2026-07-01")
    assert response.status_code == 422


def test_an_excessive_range_is_rejected(alpha: Tenant) -> None:
    response = alpha.get("/reports/export?from_date=2020-01-01&to_date=2026-01-01")
    assert response.status_code == 422


def test_export_requires_authentication(client) -> None:
    assert client.get(f"/reports/export?{_range()}").status_code == 401


def _report(by_category: list[CategoryTotal]) -> bytes:
    today = date.today()
    return build_cashflow_report(
        business_name="Nimal Stationers",
        currency="LKR",
        window=window_from_dates(today - timedelta(days=7), today, "Asia/Colombo"),
        income=Decimal("450.00"),
        expense=Decimal("120.00"),
        by_category=by_category,
        daily=[],
    )


def test_a_one_sided_period_still_renders() -> None:
    """Income and expenses get a table each, and each table reads its own direction off
    its first row. A month of costs and no takings must skip the empty side rather than
    index into it."""
    spent = [CategoryTotal(uuid.uuid4(), "Rent", "expense", Decimal("120.00"), 1)]

    assert _report(spent).startswith(b"%PDF-")
    assert _report([]).startswith(b"%PDF-")
