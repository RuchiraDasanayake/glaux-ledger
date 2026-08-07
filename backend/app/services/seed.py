import uuid

from sqlalchemy.orm import Session

from app.models import Category, EntryType

# Tuned for the first real user: a stationery / printing / scanning shop. These are a
# starting point, not a fixed taxonomy; the owner can add their own from Settings.
#
# The expense side is deliberately as detailed as the income side. A single "Expense"
# bucket makes the app a sales log rather than a book: a shop cannot tell whether a bad
# month was rent, stock or wages if all three land in the same row. Six is the ceiling --
# past that the picker stops being scannable and people file everything under Other.
DEFAULT_CATEGORIES: tuple[tuple[str, EntryType], ...] = (
    ("Stationery Sale", EntryType.income),
    ("Printing", EntryType.income),
    ("Scanning", EntryType.income),
    ("Other Sale", EntryType.income),
    ("Stock & Supplies", EntryType.expense),
    ("Utilities", EntryType.expense),
    ("Rent", EntryType.expense),
    ("Wages", EntryType.expense),
    ("Transport", EntryType.expense),
    ("Other Expense", EntryType.expense),
)


def seed_default_categories(session: Session, business_id: uuid.UUID) -> list[Category]:
    categories = [
        Category(business_id=business_id, name=name, type=entry_type.value)
        for name, entry_type in DEFAULT_CATEGORIES
    ]
    session.add_all(categories)
    return categories
