import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKey:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


class CreatedAt:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TenantScoped:
    """Supplies the ``business_id`` column to every table holding business data.

    This is also a marker type: ``TenantRepository`` raises at construction time if
    handed a model that does not inherit it, so a new table cannot quietly opt out of
    tenant filtering.
    """

    # Indexed by default so no tenant table can be added without one. Subclasses that
    # already lead a composite index with business_id set this False to avoid paying
    # for a duplicate index on every write.
    __tenant_index__ = True

    @declared_attr
    @classmethod
    def business_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
            index=cls.__tenant_index__,
        )
