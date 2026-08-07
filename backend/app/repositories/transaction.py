import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, NamedTuple

from fastapi import Depends
from sqlalchemy import ColumnElement, Select, and_, func, select

from app.core.deps import CurrentBusinessId, TenantSession
from app.models import Category, Transaction
from app.repositories.base import TenantRepository


def _escape_like(word: str) -> str:
    """A supplier called "100% Paper" must not match every entry in the book."""
    return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class CategoryTotal(NamedTuple):
    category_id: uuid.UUID
    category_name: str
    entry_type: str
    total: Decimal
    count: int


class DayTotal(NamedTuple):
    day: date
    income: Decimal
    expense: Decimal


class Outstanding(NamedTuple):
    """What is owed, and how much of it is already late."""

    payable: Decimal
    receivable: Decimal
    overdue_count: int


class OutstandingRow(NamedTuple):
    """One unpaid bill, for the report's "still owed" table."""

    counterparty: str | None
    category_name: str
    entry_type: str
    due_date: date | None
    amount: Decimal


class TransactionRepository(TenantRepository[Transaction]):
    model = Transaction

    def select(self) -> Select[tuple[Transaction]]:
        """Live rows only.

        Voided entries stay in the table as a record of the correction but must not reach
        a list, a total or a report. Overriding here rather than at each call site means a
        future query cannot forget: opting back in takes the explicit `select_all` below.
        """
        return super().select().where(Transaction.voided_at.is_(None))

    def select_all(self) -> Select[tuple[Transaction]]:
        """Including voided rows, for the History toggle and for voiding one twice."""
        return super().select()

    def get_any(self, entity_id: uuid.UUID) -> Transaction | None:
        """A voided row is still addressable, so un-voiding and auditing stay possible."""
        return (
            self.session.scalars(self.select_all().where(Transaction.id == entity_id))
            .unique()
            .one_or_none()
        )

    def _scope(
        self,
        start_utc: datetime | None = None,
        end_utc: datetime | None = None,
    ) -> list[ColumnElement[bool]]:
        """The predicates every aggregate shares: this tenant, live rows, in window.

        Aggregates build raw selects rather than going through `select`, so without this
        they would each have to remember the voided filter separately.
        """
        clauses: list[ColumnElement[bool]] = [
            Transaction.business_id == self.business_id,
            Transaction.voided_at.is_(None),
        ]
        if start_utc is not None:
            clauses.append(Transaction.occurred_at >= start_utc)
        if end_utc is not None:
            clauses.append(Transaction.occurred_at < end_utc)
        return clauses

    def list_filtered(
        self,
        *,
        start_utc: datetime | None = None,
        end_utc: datetime | None = None,
        category_id: uuid.UUID | None = None,
        entry_type: str | None = None,
        settled: bool | None = None,
        search: str | None = None,
        include_voided: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Transaction]:
        stmt = self._filtered(
            self.select_all() if include_voided else self.select(),
            start_utc=start_utc,
            end_utc=end_utc,
            category_id=category_id,
            entry_type=entry_type,
            settled=settled,
            search=search,
        )
        # Tie-broken by id so pagination is stable when two entries share a timestamp,
        # which is common once a shop backdates several bills to the same day.
        stmt = stmt.order_by(Transaction.occurred_at.desc(), Transaction.id.desc())
        return self.session.scalars(stmt.limit(limit).offset(offset)).unique().all()

    def count_filtered(
        self,
        *,
        start_utc: datetime | None = None,
        end_utc: datetime | None = None,
        category_id: uuid.UUID | None = None,
        entry_type: str | None = None,
        settled: bool | None = None,
        search: str | None = None,
        include_voided: bool = False,
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.business_id == self.business_id)
        )
        if not include_voided:
            stmt = stmt.where(Transaction.voided_at.is_(None))
        stmt = self._filtered(
            stmt,
            start_utc=start_utc,
            end_utc=end_utc,
            category_id=category_id,
            entry_type=entry_type,
            settled=settled,
            search=search,
        )
        return self.session.scalar(stmt) or 0

    def _filtered[StmtT: Select](
        self,
        stmt: StmtT,
        *,
        start_utc: datetime | None,
        end_utc: datetime | None,
        category_id: uuid.UUID | None,
        entry_type: str | None,
        settled: bool | None,
        search: str | None = None,
    ) -> StmtT:
        """Shared so the page and its count can never disagree about what they filter."""
        if start_utc is not None:
            stmt = stmt.where(Transaction.occurred_at >= start_utc)
        if end_utc is not None:
            stmt = stmt.where(Transaction.occurred_at < end_utc)
        if category_id is not None:
            stmt = stmt.where(Transaction.category_id == category_id)
        if entry_type is not None:
            stmt = stmt.where(Transaction.entry_type == entry_type)
        if settled is not None:
            stmt = stmt.where(
                Transaction.settled_at.isnot(None) if settled else Transaction.settled_at.is_(None)
            )
        if search:
            stmt = stmt.where(self._matches(search))
        return stmt

    def _matches(self, search: str) -> ColumnElement[bool]:
        """Note, supplier or category contains the words typed, in any order.

        Split on whitespace and ANDed rather than matched as one string, so "ceb august"
        finds the electricity bill whose note says "Electricity, August" and whose
        supplier says "CEB": the shopkeeper is recalling two facts about an entry, not
        quoting it.

        A LIKE cannot use the (business_id, occurred_at) index, but it runs against one
        shop's rows behind row security rather than the whole table, and a shop that has
        outgrown a sequential scan over its own ledger has outgrown this design in
        several louder ways first.
        """
        haystack = func.concat_ws(
            " ",
            Transaction.note,
            Transaction.counterparty,
            select(Category.name).where(Category.id == Transaction.category_id).scalar_subquery(),
        )
        return and_(*(haystack.ilike(f"%{_escape_like(word)}%") for word in search.split()))

    def totals_by_type(self, start_utc: datetime, end_utc: datetime) -> dict[str, Decimal]:
        """Summed in the database rather than by loading rows into Python."""
        rows = self.session.execute(
            select(Transaction.entry_type, func.coalesce(func.sum(Transaction.amount), 0))
            .where(*self._scope(start_utc, end_utc))
            .group_by(Transaction.entry_type)
        ).all()
        return {entry_type: total for entry_type, total in rows}

    def net_in_window(self, start_utc: datetime, end_utc: datetime) -> Decimal:
        """Income minus expense, for comparing a period against the one before it."""
        totals = self.totals_by_type(start_utc, end_utc)
        return Decimal(totals.get("income", 0)) - Decimal(totals.get("expense", 0))

    def outstanding(self, today: date) -> Outstanding:
        """Everything unsettled, regardless of window.

        Deliberately not windowed: a bill from two months ago is still owed today, and a
        summary that hid it because it fell outside "this week" would be worse than
        useless. `today` is the shop's local date, so "overdue" means overdue there.
        """
        unpaid = func.coalesce(func.sum(Transaction.amount), 0)
        rows = self.session.execute(
            select(
                Transaction.entry_type,
                unpaid,
                func.count(Transaction.id).filter(Transaction.due_date < today),
            )
            .where(
                Transaction.business_id == self.business_id,
                Transaction.voided_at.is_(None),
                Transaction.settled_at.is_(None),
            )
            .group_by(Transaction.entry_type)
        ).all()

        totals = {entry_type: (amount, overdue) for entry_type, amount, overdue in rows}
        payable, payable_overdue = totals.get("expense", (Decimal(0), 0))
        receivable, receivable_overdue = totals.get("income", (Decimal(0), 0))
        return Outstanding(
            payable=Decimal(payable),
            receivable=Decimal(receivable),
            overdue_count=payable_overdue + receivable_overdue,
        )

    def outstanding_rows(self, limit: int = 40) -> list[OutstandingRow]:
        """The unpaid bills themselves, soonest due first.

        Rows without a due date sort last: an open account with no agreed date is less
        pressing than one with a deadline, however old it is.
        """
        rows = self.session.execute(
            select(
                Transaction.counterparty,
                Category.name,
                Transaction.entry_type,
                Transaction.due_date,
                Transaction.amount,
            )
            .join(Category, Category.id == Transaction.category_id)
            .where(
                Transaction.business_id == self.business_id,
                Transaction.voided_at.is_(None),
                Transaction.settled_at.is_(None),
            )
            .order_by(Transaction.due_date.asc().nullslast(), Transaction.occurred_at.asc())
            .limit(limit)
        ).all()
        return [OutstandingRow(*row) for row in rows]

    def totals_by_category(self, start_utc: datetime, end_utc: datetime) -> list[CategoryTotal]:
        rows = self.session.execute(
            select(
                Category.id,
                Category.name,
                Transaction.entry_type,
                func.sum(Transaction.amount),
                func.count(Transaction.id),
            )
            .join(Category, Category.id == Transaction.category_id)
            .where(*self._scope(start_utc, end_utc))
            .group_by(Category.id, Category.name, Transaction.entry_type)
            .order_by(func.sum(Transaction.amount).desc())
        ).all()
        return [CategoryTotal(*row) for row in rows]

    def daily_series(self, start_utc: datetime, end_utc: datetime, timezone: str) -> list[DayTotal]:
        """Income and expense per local calendar day, for the cashflow trend."""
        local_day = func.date_trunc("day", func.timezone(timezone, Transaction.occurred_at)).label(
            "day"
        )
        income = func.coalesce(
            func.sum(Transaction.amount).filter(Transaction.entry_type == "income"), 0
        )
        expense = func.coalesce(
            func.sum(Transaction.amount).filter(Transaction.entry_type == "expense"), 0
        )
        rows = self.session.execute(
            select(local_day, income, expense)
            .where(*self._scope(start_utc, end_utc))
            .group_by(local_day)
            .order_by(local_day)
        ).all()
        return [DayTotal(day.date(), inc, exp) for day, inc, exp in rows]

    def recent_counterparties(self, limit: int = 20) -> list[str]:
        """Past payees, so the supplier field can autocomplete instead of being retyped."""
        rows = self.session.execute(
            select(Transaction.counterparty, func.max(Transaction.occurred_at).label("last_used"))
            .where(
                Transaction.business_id == self.business_id,
                Transaction.voided_at.is_(None),
                Transaction.counterparty.isnot(None),
            )
            .group_by(Transaction.counterparty)
            .order_by(func.max(Transaction.occurred_at).desc())
            .limit(limit)
        ).all()
        return [name for name, _ in rows]


def get_transaction_repo(
    session: TenantSession, business_id: CurrentBusinessId
) -> TransactionRepository:
    return TransactionRepository(session, business_id)


TransactionRepo = Annotated[TransactionRepository, Depends(get_transaction_repo)]
