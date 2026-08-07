from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPrimaryKey


class PlatformUser(Base, UUIDPrimaryKey, CreatedAt):
    __tablename__ = "platform_users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'reviewer')", name="ck_platform_users_role"),
    )

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
