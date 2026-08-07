import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import PaymentMethod
from app.schemas.category import CategoryOut
from app.schemas.transaction import MAX_AMOUNT

# The 29th, 30th and 31st are excluded rather than clamped. A bill set for the 30th
# would skip February outright, and silently moving it to the 28th is a different
# promise than the one the shopkeeper made.
LAST_SAFE_DAY = 28


class RecurringCreate(BaseModel):
    category_id: uuid.UUID
    name: str = Field(min_length=1, max_length=60)
    amount: Decimal = Field(gt=0, le=MAX_AMOUNT, decimal_places=2)
    day_of_month: int = Field(ge=1, le=LAST_SAFE_DAY)
    counterparty: str | None = Field(default=None, max_length=120)
    payment_method: PaymentMethod | None = None
    note: str | None = Field(default=None, max_length=500)


class RecurringUpdate(BaseModel):
    """Every field optional, including `active`, which is how a bill is paused."""

    category_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT, decimal_places=2)
    day_of_month: int | None = Field(default=None, ge=1, le=LAST_SAFE_DAY)
    counterparty: str | None = Field(default=None, max_length=120)
    payment_method: PaymentMethod | None = None
    note: str | None = Field(default=None, max_length=500)
    active: bool | None = None


class RecurringRecord(BaseModel):
    """Confirming this month's instance.

    The amount is overridable because an electricity bill is never the same twice, which
    is the entire reason these are offered rather than posted.
    """

    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT, decimal_places=2)
    settled: bool = True


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    amount: Decimal
    day_of_month: int
    counterparty: str | None
    payment_method: PaymentMethod | None
    note: str | None
    active: bool
    category: CategoryOut

    # Computed against the shop's own calendar, so they are stated rather than left for
    # each client to work out and get subtly different.
    due_on: date
    recorded_this_month: bool
    due: bool
