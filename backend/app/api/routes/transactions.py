import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.config import settings
from app.core.deps import CurrentBusiness, RequireActive, RequireAiAllowance
from app.core.limiter import upload_rate_limit
from app.models import EntryType
from app.repositories.category import CategoryRepo
from app.repositories.transaction import TransactionRepo
from app.schemas.draft import DraftEntryOut
from app.schemas.transaction import (
    CategoryBreakdown,
    DailyPoint,
    DailySeries,
    SummaryOut,
    TransactionCreate,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
)
from app.services.parsing import CategoryRef, DraftEntry, ParsingError, get_parsers
from app.services.periods import Period, previous_window, window_for_period, window_from_dates

router = APIRouter(prefix="/transactions", tags=["transactions"])

LocalDate = Annotated[
    date | None, Query(description="Inclusive, interpreted in the business timezone")
]


@router.post(
    "",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireActive],
)
def create_transaction(
    payload: TransactionCreate,
    transactions: TransactionRepo,
    categories: CategoryRepo,
) -> TransactionOut:
    # Resolved through the tenant repository, so a category id belonging to another
    # business is indistinguishable from one that does not exist.
    category = categories.get(payload.category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if category.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{category.name} has been retired. Choose another category.",
        )

    now = datetime.now(UTC)
    occurred_at = payload.occurred_at or now
    if occurred_at > now:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That date is in the future",
        )

    transaction = transactions.add(
        category_id=category.id,
        amount=payload.amount,
        entry_type=category.type,
        note=(payload.note or "").strip() or None,
        source=payload.source.value,
        occurred_at=occurred_at,
        counterparty=(payload.counterparty or "").strip() or None,
        payment_method=payload.payment_method.value if payload.payment_method else None,
        due_date=payload.due_date,
        # Settled at the moment the money moved, not the moment it was typed, so a
        # backdated cash payment does not look like it cleared late.
        settled_at=occurred_at if payload.settled else None,
    )
    transactions.session.commit()
    transactions.session.refresh(transaction)
    return TransactionOut.model_validate(transaction)


@router.patch("/{transaction_id}", response_model=TransactionOut, dependencies=[RequireActive])
def update_transaction(
    transaction_id: uuid.UUID,
    payload: TransactionUpdate,
    transactions: TransactionRepo,
    categories: CategoryRepo,
) -> TransactionOut:
    """Correct an entry. A wrong amount used to be permanent."""
    transaction = transactions.get(transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    fields = payload.model_dump(exclude_unset=True)

    if "category_id" in fields:
        category = categories.get(fields["category_id"])
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        transaction.category_id = category.id
        # Moved with the category, never set independently: the same rule that keeps
        # create honest applies to an edit.
        transaction.entry_type = category.type

    if "amount" in fields:
        transaction.amount = fields["amount"]
    if "note" in fields:
        transaction.note = (fields["note"] or "").strip() or None
    if "counterparty" in fields:
        transaction.counterparty = (fields["counterparty"] or "").strip() or None
    if "payment_method" in fields:
        method = fields["payment_method"]
        transaction.payment_method = method.value if method else None
    if "due_date" in fields:
        transaction.due_date = fields["due_date"]
    if "occurred_at" in fields and fields["occurred_at"] is not None:
        occurred_at = fields["occurred_at"]
        if occurred_at > datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="That date is in the future",
            )
        transaction.occurred_at = occurred_at

    transactions.session.commit()
    transactions.session.refresh(transaction)
    return TransactionOut.model_validate(transaction)


@router.post("/{transaction_id}/void", response_model=TransactionOut, dependencies=[RequireActive])
def void_transaction(transaction_id: uuid.UUID, transactions: TransactionRepo) -> TransactionOut:
    """Remove an entry from every total without deleting the row.

    A book that silently loses rows cannot be audited, so the entry stays on the record
    and simply stops counting.
    """
    transaction = transactions.get(transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    transaction.voided_at = datetime.now(UTC)
    transactions.session.commit()
    transactions.session.refresh(transaction)
    return TransactionOut.model_validate(transaction)


@router.post(
    "/{transaction_id}/settle", response_model=TransactionOut, dependencies=[RequireActive]
)
def settle_transaction(
    transaction_id: uuid.UUID,
    transactions: TransactionRepo,
    settled: bool = True,
) -> TransactionOut:
    """Mark a credit purchase paid, or reopen one settled by mistake."""
    transaction = transactions.get(transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    transaction.settled_at = datetime.now(UTC) if settled else None
    transactions.session.commit()
    transactions.session.refresh(transaction)
    return TransactionOut.model_validate(transaction)


@router.get("/counterparties", response_model=list[str])
def list_counterparties(transactions: TransactionRepo) -> list[str]:
    """Past suppliers and payees, so the field autocompletes instead of being retyped."""
    return transactions.recent_counterparties()


# A quarter. Longer than this and a daily bar is a hairline on any screen the chart
# will be drawn on, so the honest answer is a different chart, not a wider one.
MAX_TREND_DAYS = 92


@router.get("/daily", response_model=DailySeries)
def daily_totals(
    transactions: TransactionRepo,
    business: CurrentBusiness,
    days: Annotated[int, Query(ge=2, le=MAX_TREND_DAYS)] = 30,
) -> DailySeries:
    """Income and expense per local calendar day, for the trend chart.

    A trailing window ending today, deliberately independent of the dashboard's period
    tabs: those answer "how much today", and this answers "how has the shop been".
    """
    today = business.local_today
    window = window_from_dates(today - timedelta(days=days - 1), today, business.timezone)

    found = {
        row.day: row
        for row in transactions.daily_series(window.start_utc, window.end_utc, business.timezone)
    }
    points = []
    for offset in range(days):
        day = window.start_local + timedelta(days=offset)
        row = found.get(day)
        income = Decimal(row.income) if row else Decimal(0)
        expense = Decimal(row.expense) if row else Decimal(0)
        points.append(DailyPoint(day=day, income=income, expense=expense, net=income - expense))

    return DailySeries(
        start_date=window.start_local,
        end_date=window.end_local,
        timezone=window.timezone,
        currency=business.currency,
        points=points,
    )


@router.get("", response_model=TransactionPage)
def list_transactions(
    transactions: TransactionRepo,
    business: CurrentBusiness,
    from_date: LocalDate = None,
    to_date: LocalDate = None,
    category_id: uuid.UUID | None = None,
    entry_type: EntryType | None = None,
    settled: Annotated[
        bool | None, Query(description="False lists only what is still owed")
    ] = None,
    q: Annotated[
        str | None,
        Query(
            max_length=100,
            description="Words to find in the note, the supplier or the category name",
        ),
    ] = None,
    include_voided: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransactionPage:
    start_utc = end_utc = None
    if from_date or to_date:
        window = window_from_dates(from_date or to_date, to_date or from_date, business.timezone)
        start_utc, end_utc = window.start_utc, window.end_utc

    filters = {
        "start_utc": start_utc,
        "end_utc": end_utc,
        "category_id": category_id,
        "entry_type": entry_type.value if entry_type else None,
        "settled": settled,
        "search": (q or "").strip() or None,
        "include_voided": include_voided,
    }
    items = transactions.list_filtered(**filters, limit=limit, offset=offset)
    return TransactionPage(
        items=[TransactionOut.model_validate(item) for item in items],
        total=transactions.count_filtered(**filters),
        limit=limit,
        offset=offset,
    )


# Gated despite saving nothing: these are the front half of a write, and each one spends
# real money at OpenAI. A lapsed shop transcribing in a loop is a bill with no revenue
# behind it, and a paying one in a retry loop is a bill with too little.
@router.post(
    "/from-voice",
    response_model=DraftEntryOut,
    # Order is load-bearing: refuse a lapsed shop and a bursting one before the monthly
    # allowance is touched, so neither kind of refusal costs the shopkeeper an entry.
    dependencies=[RequireActive, Depends(upload_rate_limit), RequireAiAllowance],
)
def draft_from_voice(
    categories: CategoryRepo,
    file: Annotated[UploadFile, File(description="Recorded audio clip")],
) -> DraftEntryOut:
    """Transcribe a clip and propose an entry. Saves nothing."""
    audio = _read_upload(file, expected="audio")
    parsers = get_parsers()
    try:
        text = parsers.transcriber.transcribe(audio, file.content_type or "audio/webm")
    except ParsingError as exc:
        raise _parsing_unavailable(exc) from exc
    return _draft_from_text(text, source="voice", categories=categories)


@router.post(
    "/from-photo",
    response_model=DraftEntryOut,
    dependencies=[RequireActive, Depends(upload_rate_limit), RequireAiAllowance],
)
def draft_from_photo(
    categories: CategoryRepo,
    file: Annotated[UploadFile, File(description="Photo of a bill or receipt")],
) -> DraftEntryOut:
    """OCR a receipt and propose an entry. Saves nothing, and keeps no image."""
    image = _read_upload(file, expected="image")
    parsers = get_parsers()
    try:
        text = parsers.ocr.extract_text(image, file.content_type or "image/jpeg")
    except ParsingError as exc:
        raise _parsing_unavailable(exc) from exc
    return _draft_from_text(text, source="photo", categories=categories)


def _draft_from_text(text: str, *, source: str, categories: CategoryRepo) -> DraftEntryOut:
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nothing could be read from that. Try again or enter it manually.",
        )

    # Only this business's categories are ever offered to the extractor, so a draft
    # cannot come back referencing someone else's category.
    refs = [CategoryRef(id=c.id, name=c.name, type=c.type) for c in categories.list_ordered()]
    extractor = get_parsers().extractor
    try:
        fields = extractor.extract(text, refs)
    except ParsingError as exc:
        raise _parsing_unavailable(exc) from exc

    draft = DraftEntry.from_fields(fields, source=source, raw_text=text, provider=extractor.name)
    return DraftEntryOut.from_draft(draft)


def _read_upload(file: UploadFile, *, expected: str) -> bytes:
    content_type = file.content_type or ""
    if not content_type.startswith(f"{expected}/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Expected {expected} data, received {content_type or 'nothing'}",
        )

    payload = file.file.read(settings.max_upload_bytes + 1)
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"That file is larger than {settings.max_upload_bytes // (1024 * 1024)} MB",
        )
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The file was empty"
        )
    return payload


def _parsing_unavailable(exc: ParsingError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Could not read that right now ({exc}). You can still enter it manually.",
    )


@router.get("/summary", response_model=SummaryOut)
def transaction_summary(
    transactions: TransactionRepo,
    business: CurrentBusiness,
    period: Period = "day",
    from_date: date | None = None,
    to_date: date | None = None,
) -> SummaryOut:
    """Income vs expense for a period, aggregated in SQL.

    Day boundaries follow the business timezone, so "today" means the shop's today
    rather than UTC's.
    """
    if from_date and to_date:
        window = window_from_dates(from_date, to_date, business.timezone)
        label = "custom"
    else:
        window = window_for_period(period, business.timezone)
        label = period

    totals = transactions.totals_by_type(window.start_utc, window.end_utc)
    income = Decimal(totals.get(EntryType.income.value, 0))
    expense = Decimal(totals.get(EntryType.expense.value, 0))

    before = previous_window(window)
    outstanding = transactions.outstanding(window.end_local)

    return SummaryOut(
        period=label,
        start_date=window.start_local,
        end_date=window.end_local,
        timezone=window.timezone,
        currency=business.currency,
        income=income,
        expense=expense,
        net=income - expense,
        previous_net=transactions.net_in_window(before.start_utc, before.end_utc),
        outstanding_payable=outstanding.payable,
        outstanding_receivable=outstanding.receivable,
        overdue_count=outstanding.overdue_count,
        by_category=[
            CategoryBreakdown(
                category_id=row.category_id,
                category_name=row.category_name,
                entry_type=row.entry_type,
                total=row.total,
                count=row.count,
            )
            for row in transactions.totals_by_category(window.start_utc, window.end_utc)
        ],
    )
