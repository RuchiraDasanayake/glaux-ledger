"""Real providers, reached over plain HTTP.

Deliberately no ``openai`` SDK dependency: three endpoints are involved and the SDK
brings its own release cadence and breaking changes for very little benefit here.
Swapping to a different vendor means writing another file like this one and adding a
branch in the factory, and nothing outside this package changes.

Unused unless PARSER_PROVIDER=openai and OPENAI_API_KEY is set.
"""

import base64
import json
from decimal import Decimal, InvalidOperation

import httpx

from app.core.config import settings
from app.services.parsing.interfaces import (
    CategoryRef,
    DraftField,
    ParsedFields,
    ParsingError,
)

_API_ROOT = "https://api.openai.com/v1"
_TIMEOUT = httpx.Timeout(30.0, connect=10.0)

_SYSTEM_PROMPT = """You extract bookkeeping entries from what a Sri Lankan shopkeeper \
said or photographed. Speech is often code-switched between Sinhala, Tamil and English.

Return ONLY a JSON object:
{"amount": number|null, "category_name": string|null, "note": string|null,
 "entry_type": "income"|"expense", "on_credit": boolean,
 "counterparty": string|null, "confidence": number}

Rules:
- amount is the money involved, never a quantity of items or pages.
- category_name MUST be one of the supplied categories, copied exactly, or null.
- note is a short description in the original language.
- on_credit is true only if the text says the money has NOT been handed over yet --
  "on credit", "නයට", "pay later", "still to pay". Cash paid at the counter is false.
- counterparty is the shop or person paid, usually the heading on a receipt. Null if
  nobody is named. Never invent one.
- confidence is 0 to 1, reflecting how sure you are overall.
- If you cannot find an amount, use null rather than guessing."""


def _headers() -> dict[str, str]:
    if not settings.openai_api_key:
        raise ParsingError("OPENAI_API_KEY is not set but PARSER_PROVIDER is 'openai'")
    return {"Authorization": f"Bearer {settings.openai_api_key}"}


class OpenAITranscriber:
    name = "openai-transcribe"

    def transcribe(self, audio: bytes, content_type: str) -> str:
        extension = (content_type.split("/")[-1] or "webm").replace("x-", "")
        try:
            response = httpx.post(
                f"{_API_ROOT}/audio/transcriptions",
                headers=_headers(),
                files={"file": (f"audio.{extension}", audio, content_type)},
                data={"model": settings.openai_transcribe_model},
                timeout=_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ParsingError(f"Transcription failed: {exc}") from exc
        return response.json().get("text", "").strip()


class OpenAIVisionOcr:
    name = "openai-vision"

    def extract_text(self, image: bytes, content_type: str) -> str:
        data_url = f"data:{content_type};base64,{base64.b64encode(image).decode()}"
        payload = {
            "model": settings.openai_extract_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Transcribe every line of text in this receipt or bill. "
                                "Return the text only, no commentary."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        }
        return _chat(payload)


class OpenAIExtractor:
    name = "openai-extract"

    def extract(self, text: str, categories: list[CategoryRef]) -> ParsedFields:
        catalogue = "\n".join(f"- {c.name} ({c.type})" for c in categories)
        payload = {
            "model": settings.openai_extract_model,
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": f"Categories:\n{catalogue}\n\nText:\n{text}"},
            ],
        }
        try:
            parsed = json.loads(_chat(payload))
        except json.JSONDecodeError as exc:
            raise ParsingError(f"Model did not return JSON: {exc}") from exc

        confidence = _clamp(parsed.get("confidence", 0.5))
        amount = _to_decimal(parsed.get("amount"))
        category = _match_by_name(parsed.get("category_name"), categories)

        entry_type = category.type if category else parsed.get("entry_type", "income")
        if entry_type not in ("income", "expense"):
            entry_type = "income"

        return ParsedFields(
            amount=DraftField(amount, confidence if amount is not None else 0.0),
            category_id=DraftField(
                category.id if category else None, confidence if category else 0.0
            ),
            note=DraftField(parsed.get("note") or text or None, confidence),
            entry_type=DraftField(entry_type, confidence),
            on_credit=DraftField(bool(parsed.get("on_credit")), confidence),
            counterparty=DraftField(
                (str(parsed["counterparty"]).strip() or None)
                if parsed.get("counterparty")
                else None,
                confidence if parsed.get("counterparty") else 0.0,
            ),
        )


def _chat(payload: dict) -> str:
    try:
        response = httpx.post(
            f"{_API_ROOT}/chat/completions",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ParsingError(f"Model call failed: {exc}") from exc

    choices = response.json().get("choices") or []
    if not choices:
        raise ParsingError("Model returned no choices")
    return (choices[0].get("message", {}).get("content") or "").strip()


def _match_by_name(name: str | None, categories: list[CategoryRef]) -> CategoryRef | None:
    """Names are matched back to ids here; the model never sees or supplies a UUID."""
    if not name:
        return None
    lowered = name.strip().lower()
    return next((c for c in categories if c.name.lower() == lowered), None)


def _to_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return amount if amount > 0 else None


def _clamp(value: object) -> float:
    try:
        return max(0.0, min(1.0, float(value)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.5


__all__ = ["OpenAIExtractor", "OpenAITranscriber", "OpenAIVisionOcr"]
