"""Offline extraction from free text.

This is not a placeholder for the LLM. It is the default, and it handles the phrasing a
counter actually produces ("print 450", "scan two hundred", "paid 1200 for paper"). It
costs nothing, adds no latency, needs no API key, and keeps working when the network
does not. The LLM adapter exists for the cases this cannot reach.

Sri Lankan shop speech is heavily code-switched: Sinhala or Tamil sentence structure
with English nouns and Arabic digits, so English keywords carry most of the load, with
common Sinhala and Tamil terms alongside.
"""

import re
import uuid
from decimal import Decimal, InvalidOperation

from app.services.parsing.interfaces import CategoryRef, DraftField, ParsedFields

# Currency-marked amounts are unambiguous, so they are tried first and trusted most.
_CURRENCY_BEFORE = re.compile(
    r"(?:rs\.?|rupees?|₨|රුපියල්|ரூபாய்)\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE
)
_CURRENCY_AFTER = re.compile(
    r"([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|rupees?|/-|රුපියල්|ரூபாய்)", re.IGNORECASE
)
_BARE_NUMBER = re.compile(r"([\d,]+(?:\.\d{1,2})?)\s*(k|thousand|hundred)?", re.IGNORECASE)

_MULTIPLIERS = {"k": 1000, "thousand": 1000, "hundred": 100}

_SPELLED_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "hundred": 100, "thousand": 1000,
}  # fmt: skip

# Matched against category names by keyword. Order matters only for readability; the
# scoring below picks the best hit, not the first.
#
# The expense side is split by kind rather than lumped under one "expense" group. The
# vocabulary was always here ("electricity", "rent", "salary" were recognised words),
# but with a single Expense category they all resolved to the same row, so the shop could
# not tell a bad month caused by rent from one caused by stock.
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "printing": (
        "print", "printing", "printout", "photocopy", "copy", "copies", "xerox",
        "colour print", "color print", "මුද්‍රණ", "පිටපත", "அச்சு",
    ),
    "scanning": ("scan", "scanning", "scanned", "ස්කෑන්", "ஸ்கேன்"),
    "stationery": (
        "stationery", "pen", "pens", "pencil", "book", "books", "paper", "file",
        "envelope", "notebook", "glue", "ruler", "පොත", "පෑන", "කඩදාසි", "புத்தகம்",
    ),
    "stock": (
        "bought", "buy", "purchase", "purchased", "supplier", "stock", "wholesale",
        "ream", "reams", "cartridge", "toner", "ink", "refill", "order",
        "ගත්තා", "තොග", "වாங்கினேன்",
    ),
    "utilities": (
        "electricity", "current bill", "water bill", "water", "internet", "wifi",
        "phone bill", "utility", "utilities", "ceb", "විදුලි", "ජල", "මின்சாரம்",
    ),
    "rent": ("rent", "lease", "කුලිය", "වாடகை"),
    "wages": (
        "salary", "wages", "wage", "staff", "worker", "helper", "bonus",
        "පඩි", "වැටුප", "சம்பளம்",
    ),
    "transport": (
        "fuel", "petrol", "diesel", "three wheeler", "trishaw", "tuk", "delivery",
        "courier", "bus fare", "transport", "ප්‍රවාහන", "இணைப்பு",
    ),
    "other expense": ("expense", "repair", "maintenance", "misc", "වියදම", "செலவு"),
}  # fmt: skip

# Money going out, independent of which category matched. Includes the payment verbs,
# which belong to no single expense kind: "paid 1500" says only that it went out.
_EXPENSE_MARKERS = frozenset(
    (
        "paid", "pay", "bill", "expense", "cost", "ගෙව්වා", "බිල", "වියදම",
        "செலவு", "கொடுத்தேன்",
        *_CATEGORY_KEYWORDS["stock"],
        *_CATEGORY_KEYWORDS["utilities"],
        *_CATEGORY_KEYWORDS["rent"],
        *_CATEGORY_KEYWORDS["wages"],
        *_CATEGORY_KEYWORDS["transport"],
        *_CATEGORY_KEYWORDS["other expense"],
    )
)  # fmt: skip

# Phrases meaning the money has not actually moved yet, which is how a shop buys stock.
# Recorded so the entry lands in the outstanding total rather than silently as cash paid.
_CREDIT_MARKERS = (
    "on credit", "on account", "credit ekata", "not paid", "unpaid", "owe", "owing",
    "to pay", "pay later", "due", "නයට", "ණයට", "පසුව",  "கடன்",
)  # fmt: skip

# The name at the top of a receipt. Uppercase, no digits, and near the start: a heading
# rather than a line item.
_RECEIPT_HEADING = re.compile(r"^\s*([A-Z][A-Z&'.\- ]{4,40})\s*$", re.MULTILINE)

_PAYEE_AFTER = re.compile(
    r"(?:paid|pay|bought from|from|to)\s+([a-z][a-z&'.\- ]{2,30}?)"
    r"(?=\s+(?:rs|\d)|\s*$)",
    re.IGNORECASE,
)


class RuleBasedExtractor:
    name = "rules"

    def extract(self, text: str, categories: list[CategoryRef]) -> ParsedFields:
        cleaned = " ".join(text.split())
        lowered = cleaned.lower()

        amount, amount_confidence = _find_amount(lowered)
        looks_like_expense = any(marker in lowered for marker in _EXPENSE_MARKERS)
        category, category_confidence = _match_category(lowered, categories, looks_like_expense)

        entry_type = category.type if category else ("expense" if looks_like_expense else "income")
        on_credit = any(marker in lowered for marker in _CREDIT_MARKERS)
        counterparty = _find_counterparty(text, cleaned)

        return ParsedFields(
            amount=DraftField(amount, amount_confidence),
            category_id=DraftField(category.id if category else None, category_confidence),
            # The transcript doubles as the note. It is short, the user can edit it, and
            # keeping it means the entry records what was actually said.
            note=DraftField(cleaned or None, 0.7 if cleaned else 0.0),
            entry_type=DraftField(entry_type, category_confidence),
            # An explicit credit phrase is unambiguous; its absence only means nobody said
            # so, which is why the negative case carries no confidence at all.
            on_credit=DraftField(on_credit, 0.85 if on_credit else 0.0),
            counterparty=DraftField(counterparty, 0.7 if counterparty else 0.0),
        )


def _find_amount(text: str) -> tuple[Decimal | None, float]:
    for pattern in (_CURRENCY_BEFORE, _CURRENCY_AFTER):
        match = pattern.search(text)
        if match:
            value = _to_decimal(match.group(1))
            if value is not None:
                return value, 0.9

    candidates: list[Decimal] = []
    for match in _BARE_NUMBER.finditer(text):
        value = _to_decimal(match.group(1))
        if value is None:
            continue
        suffix = (match.group(2) or "").lower()
        if suffix in _MULTIPLIERS:
            value *= _MULTIPLIERS[suffix]
        candidates.append(value)

    if not candidates:
        spelled = _spelled_amount(text)
        # Spelled-out numbers are a best guess, so they always land under review.
        return (spelled, 0.5) if spelled else (None, 0.0)

    if len(candidates) == 1:
        return candidates[0], 0.75

    # "20 pages 450": the quantity is almost always the smaller figure. A guess, so
    # the confidence drops below the review threshold and the UI asks for a check.
    return max(candidates), 0.45


def _spelled_amount(text: str) -> Decimal | None:
    """Handles "two hundred", "five thousand", common in dictated speech."""
    words = re.findall(r"[a-z]+", text)
    total = 0
    current = 0
    matched = False

    for word in words:
        if word not in _SPELLED_NUMBERS:
            continue
        matched = True
        value = _SPELLED_NUMBERS[word]
        if value in (100, 1000):
            current = max(current, 1) * value
            total += current
            current = 0
        else:
            current += value

    total += current
    return Decimal(total) if matched and total > 0 else None


def _to_decimal(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw.replace(",", ""))
    except InvalidOperation:
        return None
    return value if value > 0 else None


def _match_category(
    text: str, categories: list[CategoryRef], looks_like_expense: bool
) -> tuple[CategoryRef | None, float]:
    if not categories:
        return None, 0.0

    best: tuple[CategoryRef, int] | None = None

    for category in categories:
        score = 0
        name = category.name.lower()

        # A direct mention of the category name is the strongest possible signal.
        if name in text:
            score += 10

        for group, keywords in _CATEGORY_KEYWORDS.items():
            if group not in name and not _group_matches_name(group, name):
                continue
            for keyword in keywords:
                if keyword in text:
                    # Longer keywords are more specific, so "colour print" outranks "copy".
                    score += 2 + len(keyword.split())

        if score and (best is None or score > best[1]):
            best = (category, score)

    if best:
        # 10+ means the category name itself appeared; treat that as near-certain.
        return best[0], 0.9 if best[1] >= 10 else 0.8

    # No keyword hit. Fall back to any category of the right direction so the sheet
    # opens with something sensible selected, but flag it for review.
    fallback_type = "expense" if looks_like_expense else "income"
    fallback = next((c for c in categories if c.type == fallback_type), categories[0])
    return fallback, 0.25


def _group_matches_name(group: str, name: str) -> bool:
    """Ties a keyword group to a category whose name differs from the group label.

    The starter set calls them "Stock & Supplies" and "Other Expense", but an owner is
    free to rename them to "Purchases" or "Sundries", so each group answers to several
    plausible names rather than to one exact string.
    """
    aliases = {
        "printing": ("print",),
        "scanning": ("scan",),
        "stationery": ("stationery", "sale"),
        "stock": ("stock", "supplies", "supplier", "purchase", "goods", "inventory"),
        "utilities": ("utilit", "electric", "water", "power", "bill"),
        "rent": ("rent", "lease"),
        "wages": ("wage", "salar", "staff", "payroll"),
        "transport": ("transport", "fuel", "travel", "delivery"),
        "other expense": ("other expense", "expense", "misc", "sundr"),
    }
    return any(alias in name for alias in aliases.get(group, ()))


def _find_counterparty(raw: str, cleaned: str) -> str | None:
    """Who the money went to.

    A receipt puts the supplier's name on its own line in capitals at the top, so that is
    tried against the untouched text before whitespace is collapsed. Speech instead says
    "paid City Paper 1800", which the second pattern picks up.
    """
    heading = _RECEIPT_HEADING.search(raw)
    if heading:
        return heading.group(1).strip().title()

    spoken = _PAYEE_AFTER.search(cleaned)
    if spoken:
        name = spoken.group(1).strip(" .-")
        # One-word matches here are almost always a common noun that happened to follow
        # "from", as in "paid from cash". A supplier's name is normally at least two words.
        if len(name.split()) >= 2:
            return name.title()
    return None


def resolve_category(
    category_id: uuid.UUID | None, categories: list[CategoryRef]
) -> CategoryRef | None:
    return next((c for c in categories if c.id == category_id), None)
