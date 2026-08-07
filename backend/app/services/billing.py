import calendar
from datetime import date

from app.models import Business


def add_months(start: date, months: int) -> date:
    total = start.month - 1 + months
    year, month = start.year + total // 12, total % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def extend_paid_through(business: Business, months: int) -> date:
    from_day = max(business.local_today, business.trial_ends_at.date())
    if business.paid_through is not None:
        from_day = max(from_day, business.paid_through)
    return add_months(from_day, months)
