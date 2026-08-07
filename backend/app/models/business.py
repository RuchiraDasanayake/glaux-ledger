from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Date, DateTime, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPrimaryKey
from app.models.enums import SubscriptionStatus

TRIAL_DAYS = 30


def default_trial_end() -> datetime:
    return datetime.now(UTC) + timedelta(days=TRIAL_DAYS)


class Business(Base, UUIDPrimaryKey, CreatedAt):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    owner_email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    # Day/week/month boundaries are computed in the shop's local time, not UTC.
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Asia/Colombo'")
    )
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'LKR'"))

    trial_ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=default_trial_end
    )
    # Paid up to and including this day. Extended by hand as payments arrive; see
    # mark_paid.py. Null means the shop has never paid, which is not the same as lapsed.
    paid_through: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Voice and photo usage, held as the first of the month the count belongs to. Kept
    # here rather than in a usage table: it is one integer per shop that is overwritten
    # monthly, and a new tenant table would need its own RLS policy to hold it.
    ai_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    ai_calls_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    @property
    def local_today(self) -> date:
        return datetime.now(ZoneInfo(self.timezone)).date()

    @property
    def ai_calls_this_month(self) -> int:
        """Zero once the stored period is stale, which is how the allowance resets."""
        if self.ai_period != self.local_today.replace(day=1):
            return 0
        return self.ai_calls_used

    @property
    def status(self) -> SubscriptionStatus:
        # Paid is checked first so that extending paid_through revives a shop whose trial
        # ran out months ago, rather than the expired trial still deciding the answer.
        if self.paid_through is not None and self.paid_through >= self.local_today:
            return SubscriptionStatus.active
        if self.trial_ends_at > datetime.now(UTC):
            return SubscriptionStatus.trialing
        return SubscriptionStatus.lapsed

    @property
    def trial_days_left(self) -> int:
        """Whole days remaining, floored at zero. Zero on the last day, not negative."""
        remaining = self.trial_ends_at - datetime.now(UTC)
        return max(remaining.days, 0)
