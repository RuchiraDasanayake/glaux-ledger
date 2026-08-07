import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAt, TenantScoped, UUIDPrimaryKey
from app.models.category import Category


class RecurringBill(Base, UUIDPrimaryKey, CreatedAt, TenantScoped):
    """A bill the shop pays on the same day every month.

    A template, not a schedule. Nothing here posts itself: on the due day the app offers
    the entry and the shopkeeper confirms it, because an electricity bill is a different
    amount every month and a book that invents figures is worse than one that asks. It
    also means no background worker, which a single container deployment does not have.
    """

    __tablename__ = "recurring_bills"
    __tenant_index__ = False
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_recurring_amount_positive"),
        # 28 rather than 31: a bill set for the 30th would silently skip February, and
        # "the end of the month" is a different feature, not a wider range on this one.
        CheckConstraint("day_of_month BETWEEN 1 AND 28", name="ck_recurring_day_of_month"),
        CheckConstraint(
            "payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank', 'credit')",
            name="ck_recurring_payment_method",
        ),
        Index("ix_recurring_business_day", "business_id", "day_of_month"),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # The usual figure. Overridable at the moment of recording, which is the whole point
    # of confirming rather than posting.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    day_of_month: Mapped[int] = mapped_column(nullable=False)
    counterparty: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Paused rather than deleted, so a seasonal bill keeps its history and its settings.
    active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))

    category: Mapped[Category] = relationship(lazy="joined")

    def due_on(self, today: date) -> date:
        """The date this month's instance falls on, in the shop's own calendar."""
        return today.replace(day=self.day_of_month)
