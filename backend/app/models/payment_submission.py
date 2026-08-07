import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, TenantScoped, UUIDPrimaryKey


class PaymentSubmission(Base, UUIDPrimaryKey, CreatedAt, TenantScoped):
    __tablename__ = "payment_submissions"
    __tenant_index__ = False
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_payment_submissions_status",
        ),
        CheckConstraint("amount > 0", name="ck_payment_submissions_amount_positive"),
        CheckConstraint("evidence_size > 0", name="ck_payment_submissions_evidence_size_positive"),
        Index(
            "ix_payment_submissions_business_created",
            "business_id",
            "created_at",
        ),
        Index("ix_payment_submissions_status_created", "status", "created_at"),
    )

    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False)
    transfer_reference: Mapped[str | None] = mapped_column(Text, nullable=True)

    evidence_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    evidence_mime: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_size: Mapped[int] = mapped_column(Integer, nullable=False)

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
