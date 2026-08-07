import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.models import EntrySource, EntryType
from app.services.parsing import DraftEntry


class DraftFieldOut[T](BaseModel):
    value: T
    confidence: float


class DraftEntryOut(BaseModel):
    """A proposal, not a record. Nothing is written until the user confirms."""

    amount: DraftFieldOut[Decimal | None]
    category_id: DraftFieldOut[uuid.UUID | None]
    note: DraftFieldOut[str | None]
    entry_type: DraftFieldOut[EntryType]
    on_credit: DraftFieldOut[bool]
    counterparty: DraftFieldOut[str | None]
    source: EntrySource
    raw_text: str
    provider: str
    # Field names the UI should flag for review.
    uncertain: list[str]

    @classmethod
    def from_draft(cls, draft: DraftEntry) -> "DraftEntryOut":
        return cls(
            amount=DraftFieldOut(value=draft.amount.value, confidence=draft.amount.confidence),
            category_id=DraftFieldOut(
                value=draft.category_id.value, confidence=draft.category_id.confidence
            ),
            note=DraftFieldOut(value=draft.note.value, confidence=draft.note.confidence),
            entry_type=DraftFieldOut(
                value=draft.entry_type.value, confidence=draft.entry_type.confidence
            ),
            on_credit=DraftFieldOut(
                value=draft.on_credit.value, confidence=draft.on_credit.confidence
            ),
            counterparty=DraftFieldOut(
                value=draft.counterparty.value, confidence=draft.counterparty.confidence
            ),
            source=draft.source,
            raw_text=draft.raw_text,
            provider=draft.provider,
            uncertain=draft.uncertain,
        )
