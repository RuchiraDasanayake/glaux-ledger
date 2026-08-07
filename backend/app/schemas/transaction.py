import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, computed_field

from app.models import EntrySource, EntryType, PaymentMethod
from app.schemas.category import CategoryOut

# NUMERIC(12,2), the largest representable amount.
MAX_AMOUNT = Decimal("9999999999.99")

_CENTS = Decimal("0.01")


def _two_places(value: Decimal) -> Decimal:
    return value.quantize(_CENTS)


# A summed NUMERIC(12,2) comes back scaled, but a Python zero for an empty period does
# not, so the same field would serialise as "0.00" on a busy day and "0" on a quiet one.
# Every money figure leaving the API is pinned to two places instead.
Money = Annotated[Decimal, AfterValidator(_two_places)]


class TransactionCreate(BaseModel):
    category_id: uuid.UUID
    amount: Decimal = Field(gt=0, le=MAX_AMOUNT, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)
    source: EntrySource = EntrySource.manual
    # entry_type is intentionally absent: it is taken from the chosen category so a
    # transaction can never contradict the category it is filed under.

    # Omitted means now, which is the counter case. Supplied means the entry is being
    # backdated: a bill paid on Monday and typed in on Friday.
    occurred_at: datetime | None = None
    counterparty: str | None = Field(default=None, max_length=120)
    payment_method: PaymentMethod | None = None
    due_date: date | None = None
    # Defaults true because most entries are cash over the counter. False records a
    # purchase on account, which is what makes the outstanding total possible.
    settled: bool = True


class TransactionUpdate(BaseModel):
    """Every field optional: a correction usually touches one thing.

    None cannot mean "clear this" and "leave alone" at the same time, so the nullable
    fields are cleared by sending an empty string or by the explicit settle route rather
    than by omission.
    """

    category_id: uuid.UUID | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)
    occurred_at: datetime | None = None
    counterparty: str | None = Field(default=None, max_length=120)
    payment_method: PaymentMethod | None = None
    due_date: date | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: Decimal
    entry_type: EntryType
    note: str | None
    source: EntrySource | None
    created_at: datetime
    occurred_at: datetime
    counterparty: str | None
    payment_method: PaymentMethod | None
    due_date: date | None
    settled_at: datetime | None
    voided_at: datetime | None
    category: CategoryOut

    @computed_field
    @property
    def settled(self) -> bool:
        """Derived rather than stored twice, so the flag cannot drift from the timestamp."""
        return self.settled_at is not None

    @computed_field
    @property
    def voided(self) -> bool:
        return self.voided_at is not None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class CategoryBreakdown(BaseModel):
    category_id: uuid.UUID
    category_name: str
    entry_type: EntryType
    total: Money
    count: int


class SummaryOut(BaseModel):
    period: str
    start_date: date
    end_date: date
    timezone: str
    currency: str
    income: Money
    expense: Money
    net: Money
    by_category: list[CategoryBreakdown]

    # The same length of time immediately before this window. A net figure on its own
    # says nothing about whether the shop is doing better or worse.
    previous_net: Money

    # Unsettled money, deliberately not windowed: a bill from two months ago is still
    # owed today. payable is owed to suppliers, receivable is owed by customers.
    outstanding_payable: Money
    outstanding_receivable: Money
    overdue_count: int


class DailyPoint(BaseModel):
    day: date
    income: Money
    expense: Money
    net: Money


class DailySeries(BaseModel):
    """Continuous daily totals, for the cashflow chart.

    Every day in the range is present, including the ones with nothing on them. The
    query only returns days that have entries, and a chart drawn from those alone puts
    Monday next to Thursday at equal spacing and quietly rewrites the week.
    """

    start_date: date
    end_date: date
    timezone: str
    currency: str
    points: list[DailyPoint]
