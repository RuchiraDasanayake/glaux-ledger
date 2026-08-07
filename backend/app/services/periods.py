from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

Period = Literal["day", "week", "month"]


@dataclass(frozen=True, slots=True)
class DateWindow:
    """A local calendar range plus the UTC instants that bound it.

    Queries filter on the UTC bounds rather than converting the stored column, which
    keeps the (business_id, occurred_at) index usable. The local dates are carried along
    for labelling in responses and reports.
    """

    start_local: date
    end_local: date  # inclusive
    start_utc: datetime
    end_utc: datetime  # exclusive
    timezone: str


def _to_utc(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(UTC)


def window_from_dates(start_local: date, end_local: date, timezone: str) -> DateWindow:
    tz = ZoneInfo(timezone)
    return DateWindow(
        start_local=start_local,
        end_local=end_local,
        start_utc=_to_utc(start_local, tz),
        # Exclusive upper bound: midnight at the start of the following local day.
        end_utc=_to_utc(end_local + timedelta(days=1), tz),
        timezone=timezone,
    )


def previous_window(window: DateWindow) -> DateWindow:
    """The same span of days immediately before the one given.

    Used for the "up or down on last week" comparison. Counted in local days rather than
    by subtracting the UTC duration, so a window spanning a DST change still lines up
    against the same number of calendar days.
    """
    span = (window.end_local - window.start_local).days + 1
    end_local = window.start_local - timedelta(days=1)
    return window_from_dates(end_local - timedelta(days=span - 1), end_local, window.timezone)


def window_for_period(period: Period, timezone: str, *, today: date | None = None) -> DateWindow:
    tz = ZoneInfo(timezone)
    local_today = today or datetime.now(tz).date()

    if period == "day":
        start = local_today
    elif period == "week":
        start = local_today - timedelta(days=local_today.weekday())  # Monday
    elif period == "month":
        start = local_today.replace(day=1)
    else:
        raise ValueError(f"Unsupported period: {period!r}")

    return window_from_dates(start, local_today, timezone)
