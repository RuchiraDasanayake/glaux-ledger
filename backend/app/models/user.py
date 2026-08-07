from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, TenantScoped, UUIDPrimaryKey


class User(Base, UUIDPrimaryKey, CreatedAt, TenantScoped):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
