"""Renders a sample report so the layout can be eyeballed without clicking through the UI.

python scripts/preview_report.py [output.pdf]
"""

import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.repositories.transaction import CategoryTotal, DayTotal
from app.services.pdf import build_cashflow_report
from app.services.periods import window_from_dates

END = date.today()
START = END - timedelta(days=13)


def main() -> None:
    destination = sys.argv[1] if len(sys.argv) > 1 else "sample-report.pdf"

    daily = [
        DayTotal(
            START + timedelta(days=offset),
            Decimal(900 + (offset * 317) % 2600),
            Decimal(120 + (offset * 173) % 900),
        )
        for offset in range(14)
    ]
    income = sum((day.income for day in daily), Decimal(0))
    expense = sum((day.expense for day in daily), Decimal(0))

    by_category = [
        CategoryTotal(uuid.uuid4(), "Printing", "income", income * Decimal("0.52"), 84),
        CategoryTotal(uuid.uuid4(), "Stationery Sale", "income", income * Decimal("0.31"), 51),
        CategoryTotal(uuid.uuid4(), "Scanning", "income", income * Decimal("0.17"), 23),
        # Several, not one lump: the report groups the two directions into their own
        # tables, and a single cost row cannot show whether that grouping came out right.
        CategoryTotal(uuid.uuid4(), "Stock & Supplies", "expense", expense * Decimal("0.55"), 9),
        CategoryTotal(uuid.uuid4(), "Rent", "expense", expense * Decimal("0.28"), 1),
        CategoryTotal(uuid.uuid4(), "Transport", "expense", expense * Decimal("0.11"), 6),
        CategoryTotal(uuid.uuid4(), "Utilities", "expense", expense * Decimal("0.06"), 3),
    ]

    pdf = build_cashflow_report(
        business_name="Nimal Stationers & Printing",
        currency="LKR",
        window=window_from_dates(START, END, "Asia/Colombo"),
        income=income,
        expense=expense,
        by_category=by_category,
        daily=daily,
    )

    with open(destination, "wb") as handle:
        handle.write(pdf)
    print(f"Wrote {destination} ({len(pdf):,} bytes)")


if __name__ == "__main__":
    main()
