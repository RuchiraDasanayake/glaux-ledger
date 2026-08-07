from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantScoped, UUIDPrimaryKey


class Category(Base, UUIDPrimaryKey, TenantScoped):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("type IN ('income', 'expense')", name="ck_categories_type"),
        UniqueConstraint("business_id", "name", name="uq_categories_business_name"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)

    # Categories retire rather than delete: transactions reference them with RESTRICT,
    # and last year's report should still say "Scanning" even once the shop stops
    # offering it. Archived categories leave the picker and nothing else.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def archived(self) -> bool:
        return self.archived_at is not None
