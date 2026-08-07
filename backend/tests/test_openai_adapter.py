"""The real provider, against a fake transport.

Until now this file did not exist and nothing exercised `openai_adapter` at all. The
suite runs with PARSER_PROVIDER=stub, so the code that actually spends money was the only
code in the project never executed by a test. These do not prove OpenAI understands
Sinhala; they prove we send a request of the right shape to the right endpoint and read
the answer back correctly, which is the half that breaks silently on a model swap.

Live verification against real audio and a real receipt needs a key, and lives in
tools/check_openai.py.
"""

import json
import uuid
from typing import Any

import httpx
import pytest

from app.core.config import settings
from app.services.parsing.interfaces import CategoryRef, ParsingError
from app.services.parsing.openai_adapter import (
    OpenAIExtractor,
    OpenAITranscriber,
    OpenAIVisionOcr,
)

CATEGORIES = [
    CategoryRef(id=uuid.uuid4(), name="Printing", type="income"),
    CategoryRef(id=uuid.uuid4(), name="Stock & Supplies", type="expense"),
]


class Recorder:
    """Stands in for httpx.post and remembers the one call it was given."""

    def __init__(self, payload: dict[str, Any], status: int = 200) -> None:
        self.payload = payload
        self.status = status
        self.url: str = ""
        self.kwargs: dict[str, Any] = {}

    def __call__(self, url: str, **kwargs: Any) -> httpx.Response:
        self.url = url
        self.kwargs = kwargs
        return httpx.Response(self.status, json=self.payload, request=httpx.Request("POST", url))


def _chat_reply(content: str) -> dict[str, Any]:
    return {"choices": [{"message": {"content": content}}]}


@pytest.fixture(autouse=True)
def _api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "sk-test-not-a-real-key")


def test_transcription_posts_the_configured_model(monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = Recorder({"text": "  paper five thousand  "})
    monkeypatch.setattr(httpx, "post", recorder)

    text = OpenAITranscriber().transcribe(b"audio-bytes", "audio/webm")

    assert text == "paper five thousand"
    assert recorder.url.endswith("/audio/transcriptions")
    assert recorder.kwargs["data"]["model"] == settings.openai_transcribe_model
    assert recorder.kwargs["files"]["file"][0] == "audio.webm"


def test_the_default_transcription_model_is_the_cheap_one() -> None:
    """Half the price of whisper-1. Pinned because it is a one-word config change to
    undo and the difference does not show up until the invoice."""
    assert settings.openai_transcribe_model == "gpt-4o-mini-transcribe"


def test_a_missing_key_is_a_parsing_error_not_a_crash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", None)
    with pytest.raises(ParsingError, match="OPENAI_API_KEY"):
        OpenAITranscriber().transcribe(b"x", "audio/webm")


def test_transcription_failure_surfaces_as_a_parsing_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(httpx, "post", Recorder({"error": "nope"}, status=500))
    with pytest.raises(ParsingError, match="Transcription failed"):
        OpenAITranscriber().transcribe(b"x", "audio/webm")


def test_ocr_sends_the_image_inline(monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = Recorder(_chat_reply("CITY PAPER SUPPLIES\nA4 x 20\n18,000"))
    monkeypatch.setattr(httpx, "post", recorder)

    text = OpenAIVisionOcr().extract_text(b"\xff\xd8jpeg", "image/jpeg")

    assert "CITY PAPER SUPPLIES" in text
    content = recorder.kwargs["json"]["messages"][0]["content"]
    image_part = next(part for part in content if part["type"] == "image_url")
    assert image_part["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_extraction_maps_a_category_name_back_to_its_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        Recorder(
            _chat_reply(
                json.dumps(
                    {
                        "amount": 18000,
                        "category_name": "Stock & Supplies",
                        "note": "A4 paper",
                        "entry_type": "expense",
                        "on_credit": True,
                        "counterparty": "City Paper Supplies",
                        "confidence": 0.9,
                    }
                )
            )
        ),
    )

    fields = OpenAIExtractor().extract("A4 paper 18000 on credit", CATEGORIES)

    assert fields.amount.value == 18000
    assert fields.category_id.value == CATEGORIES[1].id
    assert fields.entry_type.value == "expense"
    assert fields.on_credit.value is True
    assert fields.counterparty.value == "City Paper Supplies"
    assert fields.amount.confidence == pytest.approx(0.9)


def test_an_unknown_category_yields_no_id_rather_than_a_guess(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The model is told to copy a name exactly. When it invents one instead, the draft
    arrives with the category blank for the shopkeeper to pick, never mapped to
    whichever real category happens to look closest."""
    monkeypatch.setattr(
        httpx,
        "post",
        Recorder(
            _chat_reply(
                json.dumps({"amount": 500, "category_name": "Photocopying", "confidence": 0.8})
            )
        ),
    )

    fields = OpenAIExtractor().extract("photocopy 500", CATEGORIES)

    assert fields.category_id.value is None
    assert fields.category_id.confidence == 0.0


def test_a_non_json_reply_is_a_parsing_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "post", Recorder(_chat_reply("I'm afraid I can't do that")))
    with pytest.raises(ParsingError, match="did not return JSON"):
        OpenAIExtractor().extract("anything", CATEGORIES)


def test_a_missing_amount_is_null_with_no_confidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        Recorder(_chat_reply(json.dumps({"amount": None, "confidence": 0.9}))),
    )

    fields = OpenAIExtractor().extract("something inaudible", CATEGORIES)

    assert fields.amount.value is None
    assert fields.amount.confidence == 0.0


def test_a_negative_amount_is_discarded(monkeypatch: pytest.MonkeyPatch) -> None:
    """Direction is carried by the category, never by the sign, so a negative here is
    the model misunderstanding rather than an expense."""
    monkeypatch.setattr(
        httpx,
        "post",
        Recorder(_chat_reply(json.dumps({"amount": -400, "confidence": 0.9}))),
    )

    assert OpenAIExtractor().extract("refund 400", CATEGORIES).amount.value is None
