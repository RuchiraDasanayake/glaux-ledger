import uuid
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentBusiness, RequireActive
from app.models import RecurringBill
from app.repositories.category import CategoryRepo
from app.repositories.recurring import RecurringRepo
from app.repositories.transaction import TransactionRepo
from app.schemas.recurring import (
    RecurringCreate,
    RecurringOut,
    RecurringRecord,
    RecurringUpdate,
)
from app.schemas.transaction import TransactionOut
from app.services.periods import window_from_dates

router = APIRouter(prefix="/recurring", tags=["recurring"])


@router.get("", response_model=list[RecurringOut])
def list_recurring(
    repo: RecurringRepo,
    business: CurrentBusiness,
    include_paused: bool = True,
) -> list[RecurringOut]:
    """The shop's standing costs, each marked with whether it is owed yet this month."""
    bills = repo.list_ordered(include_paused=include_paused)
    if not bills:
        return []

    today = business.local_today
    month = window_from_dates(today.replace(day=1), today, business.timezone)
    recorded = repo.recorded_between(month.start_utc, month.end_utc)
    return [_present(bill, today, bill.id in recorded) for bill in bills]


@router.post(
    "",
    response_model=RecurringOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireActive],
)
def create_recurring(
    payload: RecurringCreate,
    repo: RecurringRepo,
    categories: CategoryRepo,
    business: CurrentBusiness,
) -> RecurringOut:
    category = _category_or_404(categories, payload.category_id)
    bill = repo.add(
        category_id=category.id,
        name=payload.name.strip(),
        amount=payload.amount,
        day_of_month=payload.day_of_month,
        counterparty=(payload.counterparty or "").strip() or None,
        payment_method=payload.payment_method.value if payload.payment_method else None,
        note=(payload.note or "").strip() or None,
    )
    repo.session.commit()
    repo.session.refresh(bill)
    return _present(bill, business.local_today, recorded=False)


@router.patch("/{bill_id}", response_model=RecurringOut, dependencies=[RequireActive])
def update_recurring(
    bill_id: uuid.UUID,
    payload: RecurringUpdate,
    repo: RecurringRepo,
    categories: CategoryRepo,
    business: CurrentBusiness,
) -> RecurringOut:
    bill = _bill_or_404(repo, bill_id)
    fields = payload.model_dump(exclude_unset=True)

    if "category_id" in fields and fields["category_id"] is not None:
        bill.category_id = _category_or_404(categories, fields["category_id"]).id
    if fields.get("name") is not None:
        bill.name = fields["name"].strip()
    if fields.get("amount") is not None:
        bill.amount = fields["amount"]
    if fields.get("day_of_month") is not None:
        bill.day_of_month = fields["day_of_month"]
    if "counterparty" in fields:
        bill.counterparty = (fields["counterparty"] or "").strip() or None
    if "payment_method" in fields:
        method = fields["payment_method"]
        bill.payment_method = method.value if method else None
    if "note" in fields:
        bill.note = (fields["note"] or "").strip() or None
    if fields.get("active") is not None:
        bill.active = fields["active"]

    repo.session.commit()
    repo.session.refresh(bill)
    return _present(bill, business.local_today, _recorded_this_month(repo, business))


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireActive])
def delete_recurring(bill_id: uuid.UUID, repo: RecurringRepo) -> None:
    """Remove the template. The entries it produced stay in the ledger.

    Unlike categories, which are archived rather than deleted because history refers to
    them by name, this is a reminder and nothing more: the transactions carry their own
    copy of every field and the foreign key is ON DELETE SET NULL.
    """
    repo.delete(_bill_or_404(repo, bill_id))
    repo.session.commit()


@router.post(
    "/{bill_id}/record",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireActive],
)
def record_recurring(
    bill_id: uuid.UUID,
    payload: RecurringRecord,
    repo: RecurringRepo,
    transactions: TransactionRepo,
    business: CurrentBusiness,
) -> TransactionOut:
    """Confirm this month's instance, at the usual amount or a corrected one."""
    bill = _bill_or_404(repo, bill_id)
    today = business.local_today
    month = window_from_dates(today.replace(day=1), today, business.timezone)

    if bill.id in repo.recorded_between(month.start_utc, month.end_utc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{bill.name} has already been recorded this month",
        )

    # Dated to the day the bill falls due, not the day it was confirmed. Rent recorded
    # three days late is still that month's rent, and the report should say so, unless
    # the due day is still ahead, in which case dating it forward would be a future
    # entry, which the ledger refuses everywhere else too.
    due_on = min(bill.due_on(today), today)
    occurred_at = _at_noon(due_on, business.timezone)

    transaction = transactions.add(
        category_id=bill.category_id,
        recurring_id=bill.id,
        amount=payload.amount if payload.amount is not None else bill.amount,
        entry_type=bill.category.type,
        note=bill.note,
        source="manual",
        occurred_at=occurred_at,
        counterparty=bill.counterparty,
        payment_method=bill.payment_method,
        settled_at=occurred_at if payload.settled else None,
    )
    transactions.session.commit()
    transactions.session.refresh(transaction)
    return TransactionOut.model_validate(transaction)


def _present(bill: RecurringBill, today: date, recorded: bool) -> RecurringOut:
    due_on = bill.due_on(today)
    return RecurringOut(
        id=bill.id,
        name=bill.name,
        amount=bill.amount,
        day_of_month=bill.day_of_month,
        counterparty=bill.counterparty,
        payment_method=bill.payment_method,
        note=bill.note,
        active=bill.active,
        category=bill.category,
        due_on=due_on,
        recorded_this_month=recorded,
        # A paused bill is never due, and nothing is due before its day arrives.
        due=bill.active and not recorded and due_on <= today,
    )


def _recorded_this_month(repo: RecurringRepo, business: CurrentBusiness) -> bool:
    today = business.local_today
    month = window_from_dates(today.replace(day=1), today, business.timezone)
    return bool(repo.recorded_between(month.start_utc, month.end_utc))


def _at_noon(day: date, timezone: str) -> datetime:
    """Midday local, not midnight.

    Midnight in the shop's zone is the instant a day boundary is drawn at, so a rounding
    difference anywhere downstream can land the entry on the day before. Noon has twelve
    hours of slack in both directions.
    """
    return datetime.combine(day, time(12, 0), tzinfo=ZoneInfo(timezone)).astimezone(UTC)


def _bill_or_404(repo: RecurringRepo, bill_id: uuid.UUID) -> RecurringBill:
    bill = repo.get(bill_id)
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


def _category_or_404(categories: CategoryRepo, category_id: uuid.UUID):
    category = categories.get(category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if category.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{category.name} has been retired. Choose another category.",
        )
    return category
