"""Fill a shop with a fortnight of plausible trading, for looking at the UI with content.

Empty states hide most design problems. This creates a real business you can log into and
a history dense enough that the dashboard bars, the day grouping, the outstanding strip
and the PDF all have something to show.

    python seed_demo.py

Writes through the models rather than the API. Backdating is possible over HTTP now, but
the models let a whole fortnight be composed in one transaction, and the settled/voided
states here are set directly rather than through three round trips each. Safe to run
repeatedly; each run makes a new shop.
"""

import random
import sys
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.api.routes.auth import seed_default_categories
from app.core.security import hash_password
from app.db.session import SessionLocal, bind_tenant
from app.models import Business, Category, EntrySource, PaymentMethod, Transaction, User

PASSWORD = "a-sufficiently-long-password"
DAYS = 14

# Weighted so the shape resembles a stationery and printing counter: many small print
# jobs, fewer but larger stationery sales, occasional stock purchases.
INCOME_PATTERN = {
    "Printing": (14, (50, 900), ["10 pages", "colour A4", "50 photocopies", "poster A3"]),
    "Scanning": (5, (50, 400), ["ID scan", "12 documents", "certificates"]),
    "Stationery Sale": (8, (120, 3500), ["exercise books", "pens box", "files", "glue"]),
    "Other Sale": (3, (100, 1200), ["lamination", "binding", "photocopy card"]),
}

# How a real counter spends: stock often and on account, utilities monthly, rent and
# wages once. `chance` is per day, or None for the fixed monthly charges placed below.
EXPENSE_PATTERN = {
    "Stock & Supplies": (
        0.35,
        (800, 12000),
        ["A4 paper ream", "toner cartridge", "ink refill", "box files"],
        ["City Paper Supplies", "Lanka Ink House", "Metro Stationers"],
    ),
    "Transport": (0.25, (200, 1500), ["three-wheeler delivery", "courier", "fuel"], [None]),
    "Other Expense": (0.12, (150, 2000), ["tea for staff", "bulb replaced", "cleaning"], [None]),
}

SOURCES = [EntrySource.manual, EntrySource.voice, EntrySource.photo]


def main() -> int:
    rng = random.Random(20260802)
    email = f"demo-{uuid.uuid4().hex[:6]}@example.com"

    with SessionLocal() as session:
        business = Business(name="Nimal Stationers", owner_email=email)
        session.add(business)
        session.flush()
        bind_tenant(session, business.id)

        session.add(
            User(
                business_id=business.id,
                email=email,
                hashed_password=hash_password(PASSWORD),
            )
        )
        seed_default_categories(session, business.id)
        session.flush()

        categories = {
            category.name: category
            for category in session.scalars(
                select(Category).where(Category.business_id == business.id)
            )
        }

        tz = ZoneInfo(business.timezone)
        now = datetime.now(tz)
        written = 0

        def record(name: str, amount: Decimal, when: datetime, **extra) -> None:
            nonlocal written
            category = categories[name]
            session.add(
                Transaction(
                    business_id=business.id,
                    category_id=category.id,
                    amount=amount,
                    entry_type=category.type,
                    occurred_at=when,
                    created_at=when,
                    # Settled unless a caller says otherwise, matching a cash counter.
                    settled_at=extra.pop("settled_at", when),
                    **extra,
                )
            )
            written += 1

        for day_offset in range(DAYS):
            day = now - timedelta(days=day_offset)
            # Sunday is quiet, and today has only run half its course.
            busyness = 0.35 if day.weekday() == 6 else 1.0
            if day_offset == 0:
                busyness *= 0.5

            for name, (base_count, (low, high), notes) in INCOME_PATTERN.items():
                for _ in range(round(base_count * busyness * rng.uniform(0.6, 1.4))):
                    record(
                        name,
                        Decimal(rng.randrange(low, high, 10)),
                        _trading_moment(day, rng),
                        note=rng.choice(notes),
                        source=rng.choices(SOURCES, weights=[6, 3, 1])[0],
                        payment_method=PaymentMethod.cash.value,
                    )

            for name, (chance, (low, high), notes, suppliers) in EXPENSE_PATTERN.items():
                if rng.random() >= chance:
                    continue
                when = _trading_moment(day, rng)
                # Roughly a third of stock is taken on account, which is what gives the
                # dashboard an outstanding figure worth looking at.
                on_credit = name == "Stock & Supplies" and rng.random() < 0.35
                record(
                    name,
                    Decimal(rng.randrange(low, high, 50)),
                    when,
                    note=rng.choice(notes),
                    source=EntrySource.manual,
                    counterparty=rng.choice(suppliers),
                    payment_method=(
                        PaymentMethod.credit.value if on_credit else PaymentMethod.cash.value
                    ),
                    due_date=(when + timedelta(days=30)).date() if on_credit else None,
                    settled_at=None if on_credit else when,
                )

        # The monthly charges, which are what make the category breakdown honest: rent
        # alone usually outweighs a fortnight of printing.
        month_start = now.replace(day=1, hour=10, minute=0, second=0, microsecond=0)
        if month_start > now - timedelta(days=DAYS):
            record("Rent", Decimal(35000), month_start, note="Shop rent", counterparty="M. Perera")
            record("Wages", Decimal(48000), month_start, note="Assistant, monthly")

        # One electricity bill left unpaid and already late, so the overdue count is
        # non-zero and the strip has something urgent to say.
        overdue_on = now - timedelta(days=9)
        record(
            "Utilities",
            Decimal(6450),
            overdue_on,
            note="Electricity, August",
            counterparty="CEB",
            payment_method=PaymentMethod.credit.value,
            due_date=(now - timedelta(days=2)).date(),
            settled_at=None,
        )

        session.commit()

    print(f"\nSeeded {written} transactions across {DAYS} days for 'Nimal Stationers'.")
    print("\nLog in at http://localhost:5173")
    print(f"  email     {email}")
    print(f"  password  {PASSWORD}")
    return 0


def _trading_moment(day: datetime, rng: random.Random) -> datetime:
    """Somewhere inside shop hours, so the day grouping in History looks natural."""
    return day.replace(
        hour=rng.randint(8, 18),
        minute=rng.randrange(0, 60),
        second=rng.randrange(0, 60),
        microsecond=0,
    )


if __name__ == "__main__":
    sys.exit(main())
