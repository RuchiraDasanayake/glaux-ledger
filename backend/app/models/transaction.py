import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAt, TenantScoped, UUIDPrimaryKey
from app.models.category import Category


class Transaction(Base, UUIDPrimaryKey, CreatedAt, TenantScoped):
    __tablename__ = "transactions"
    # The composite index below already leads with business_id.
    __tenant_index__ = False
    __table_args__ = (
        CheckConstraint("entry_type IN ('income', 'expense')", name="ck_transactions_entry_type"),
        CheckConstraint(
            "source IS NULL OR source IN ('manual', 'voice', 'photo')",
            name="ck_transactions_source",
        ),
        CheckConstraint(
            "payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank', 'credit')",
            name="ck_transactions_payment_method",
        ),
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
        # History and summaries always read one business's rows newest-first by the date
        # the money moved; Postgres scans this backwards for ORDER BY occurred_at DESC.
        Index("ix_transactions_business_occurred", "business_id", "occurred_at"),
        # Outstanding bills are a small slice of a growing table, so the index that
        # answers "what do I still owe" only carries the unsettled rows.
        Index(
            "ix_transactions_outstanding",
            "business_id",
            "due_date",
            postgresql_where=text("settled_at IS NULL AND voided_at IS NULL"),
        ),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )

    # Which recurring bill produced this, if any. Set here rather than inferred from a
    # matching category and month: "have I already recorded the rent" has to be an exact
    # question, and voiding the entry has to make the bill due again.
    recurring_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recurring_bills.id", ondelete="SET NULL"), nullable=True
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    entry_type: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)

    # When the money actually moved, as opposed to created_at, which is when someone
    # typed it in. They diverge whenever a bill is entered days after it was paid, and
    # every filter, summary and report keys off this one.
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Who it was paid to or bought from. A column rather than a suppliers table: it
    # carries most of the value for a shop that deals with a handful of suppliers, and
    # can be promoted to its own entity later without touching the rows already written.
    counterparty: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(Text, nullable=True)

    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # NULL means the money has not changed hands yet. Cash entries are settled on the
    # spot; a credit purchase stays open until it is paid.
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Corrections void rather than delete. A ledger that silently loses rows cannot be
    # audited, so a voided entry leaves every total but stays on the record.
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    category: Mapped[Category] = relationship(lazy="joined")

    @property
    def settled(self) -> bool:
        return self.settled_at is not None
