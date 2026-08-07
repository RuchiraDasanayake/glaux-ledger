import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select

from app.core.deps import CurrentBusinessId, TenantSession
from app.models import RecurringBill, Transaction
from app.repositories.base import TenantRepository


class RecurringRepository(TenantRepository[RecurringBill]):
    model = RecurringBill

    def list_ordered(self, *, include_paused: bool = True) -> Sequence[RecurringBill]:
        """Earliest in the month first, which is the order they fall due in."""
        stmt = self.select()
        if not include_paused:
            stmt = stmt.where(RecurringBill.active.is_(True))
        return (
            self.session.scalars(stmt.order_by(RecurringBill.day_of_month, RecurringBill.name))
            .unique()
            .all()
        )

    def recorded_between(self, start_utc: datetime, end_utc: datetime) -> dict[uuid.UUID, datetime]:
        """When each bill was last recorded inside the window, for the whole list at once.

        One query for every bill rather than one per bill: this runs on every load of
        the entry screen, and a shop with a dozen standing costs should not pay a dozen
        round trips for it.

        Voided entries are excluded, so undoing a mistaken rent entry makes the bill due
        again, which is the only behaviour that would not confuse someone correcting a
        typo.
        """
        rows = self.session.execute(
            select(Transaction.recurring_id, Transaction.occurred_at)
            .where(
                Transaction.business_id == self.business_id,
                Transaction.recurring_id.isnot(None),
                Transaction.voided_at.is_(None),
                Transaction.occurred_at >= start_utc,
                Transaction.occurred_at < end_utc,
            )
            .order_by(Transaction.occurred_at.desc())
        ).all()

        latest: dict[uuid.UUID, datetime] = {}
        for recurring_id, occurred_at in rows:
            latest.setdefault(recurring_id, occurred_at)
        return latest


def get_recurring_repo(
    session: TenantSession, business_id: CurrentBusinessId
) -> RecurringRepository:
    return RecurringRepository(session, business_id)


RecurringRepo = Annotated[RecurringRepository, Depends(get_recurring_repo)]
