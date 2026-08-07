from enum import StrEnum


class EntryType(StrEnum):
    income = "income"
    expense = "expense"


class EntrySource(StrEnum):
    manual = "manual"
    voice = "voice"
    photo = "photo"


class PaymentMethod(StrEnum):
    """How the money moved.

    ``credit`` is the one that carries weight: a shop buying stock on account has not
    parted with cash yet, so a credit entry is expected to arrive with settled_at unset.
    """

    cash = "cash"
    card = "card"
    bank = "bank"
    credit = "credit"


class SubscriptionStatus(StrEnum):
    """Derived from two dates, never stored.

    A stored copy is a third source of truth that has to be kept in step with the dates
    by something (a cron, a webhook, a login hook) and the day that something fails
    is the day a paying shop is locked out or a lapsed one keeps writing for free.
    """

    trialing = "trialing"
    active = "active"
    lapsed = "lapsed"


class PaymentSubmissionStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class PlatformRole(StrEnum):
    admin = "admin"
    reviewer = "reviewer"
