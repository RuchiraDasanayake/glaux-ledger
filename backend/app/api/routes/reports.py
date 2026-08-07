from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from app.core.deps import CurrentBusiness
from app.models import EntryType
from app.repositories.transaction import TransactionRepo
from app.services.pdf import build_cashflow_report
from app.services.periods import window_from_dates

router = APIRouter(prefix="/reports", tags=["reports"])

# A year of daily bars is already dense; beyond that the chart is meaningless and the
# query gets expensive for no benefit.
MAX_RANGE_DAYS = 366


@router.get(
    "/export",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "Cashflow report"}},
)
def export_report(
    transactions: TransactionRepo,
    business: CurrentBusiness,
    from_date: Annotated[date, Query(description="Inclusive, in the business timezone")],
    to_date: Annotated[date, Query(description="Inclusive, in the business timezone")],
) -> Response:
    if to_date < from_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The end date is before the start date",
        )
    if (to_date - from_date) > timedelta(days=MAX_RANGE_DAYS):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Choose a range of {MAX_RANGE_DAYS} days or less",
        )

    window = window_from_dates(from_date, to_date, business.timezone)
    totals = transactions.totals_by_type(window.start_utc, window.end_utc)

    pdf = build_cashflow_report(
        business_name=business.name,
        currency=business.currency,
        window=window,
        income=Decimal(totals.get(EntryType.income.value, 0)),
        expense=Decimal(totals.get(EntryType.expense.value, 0)),
        by_category=transactions.totals_by_category(window.start_utc, window.end_utc),
        daily=transactions.daily_series(window.start_utc, window.end_utc, business.timezone),
        # Not windowed, unlike everything above it. A report that showed a healthy month
        # while omitting the supplier bills still outstanding would be misleading to the
        # landlord or lender it is usually printed for.
        outstanding=transactions.outstanding_rows(),
    )

    slug = "".join(ch if ch.isalnum() else "-" for ch in business.name.lower()).strip("-")
    filename = f"{slug or 'glaux'}-{from_date}-to-{to_date}.pdf"

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
