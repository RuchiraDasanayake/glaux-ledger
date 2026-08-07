"""The seam between the app and whatever does speech-to-text, OCR, and extraction.

Three narrow protocols instead of one "AI service", because the three jobs have
genuinely different failure modes and are worth swapping independently. You might want
a real transcriber but keep rule-based extraction, or vice versa.

Nothing here persists anything. Extraction produces a draft; the user confirms it, and
only then does a transaction get written.
"""

import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Protocol, runtime_checkable


class ParsingError(Exception):
    """Raised when a provider cannot produce anything usable."""


@dataclass(frozen=True, slots=True)
class CategoryRef:
    """A category as the extractor sees it, with no ORM objects across this boundary."""

    id: uuid.UUID
    name: str
    type: str


@dataclass(frozen=True, slots=True)
class DraftField[T]:
    value: T
    # 0.0 means "no idea", 1.0 means certain. The UI flags anything below
    # REVIEW_THRESHOLD so attention goes to the fields that need it, rather than
    # making everything look equally doubtful.
    confidence: float = 0.0


REVIEW_THRESHOLD = 0.6


@dataclass(frozen=True, slots=True)
class ParsedFields:
    """What an extractor returns, before it is assembled into a draft."""

    amount: DraftField[Decimal | None]
    category_id: DraftField[uuid.UUID | None]
    note: DraftField[str | None]
    entry_type: DraftField[str]
    # "Bought two reams on credit" is a different entry from "paid for two reams", and
    # only the shopkeeper's own words distinguish them. Defaults to settled, because most
    # of what a counter records is cash changing hands there and then.
    on_credit: DraftField[bool] = field(default_factory=lambda: DraftField(False, 0.0))
    # A supplier's name is usually the largest text on a receipt, so it is worth lifting.
    counterparty: DraftField[str | None] = field(default_factory=lambda: DraftField(None, 0.0))


@dataclass(frozen=True, slots=True)
class DraftEntry:
    amount: DraftField[Decimal | None]
    category_id: DraftField[uuid.UUID | None]
    note: DraftField[str | None]
    entry_type: DraftField[str]
    source: str
    # Surfaced to the user so a wrong parse is diagnosable rather than mysterious.
    raw_text: str
    provider: str
    on_credit: DraftField[bool] = field(default_factory=lambda: DraftField(False, 0.0))
    counterparty: DraftField[str | None] = field(default_factory=lambda: DraftField(None, 0.0))
    uncertain: list[str] = field(default_factory=list)

    @classmethod
    def from_fields(
        cls, fields: ParsedFields, *, source: str, raw_text: str, provider: str
    ) -> "DraftEntry":
        uncertain = [
            name
            for name, item in (
                ("amount", fields.amount),
                ("category", fields.category_id),
                ("note", fields.note),
            )
            if item.confidence < REVIEW_THRESHOLD
        ]
        return cls(
            amount=fields.amount,
            category_id=fields.category_id,
            note=fields.note,
            entry_type=fields.entry_type,
            source=source,
            raw_text=raw_text,
            provider=provider,
            on_credit=fields.on_credit,
            counterparty=fields.counterparty,
            uncertain=uncertain,
        )


@runtime_checkable
class Transcriber(Protocol):
    name: str

    def transcribe(self, audio: bytes, content_type: str) -> str: ...


@runtime_checkable
class OcrEngine(Protocol):
    name: str

    def extract_text(self, image: bytes, content_type: str) -> str: ...


@runtime_checkable
class EntryExtractor(Protocol):
    name: str

    def extract(self, text: str, categories: list[CategoryRef]) -> ParsedFields: ...
