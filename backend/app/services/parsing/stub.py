"""Offline stand-ins for speech-to-text and OCR.

These cannot actually transcribe or read anything. They return realistic sample text so
the whole capture-confirm-save flow is exercisable, and testable, without an API key
or network access. The response always reports ``provider: "stub"``, so nothing
downstream can mistake this for a real reading.

Output is chosen by hashing the upload, so the same file always yields the same text
(repeatable tests) while different files vary (you can see the flow handle more than one
shape of input).
"""

import hashlib

_SPOKEN_SAMPLES = (
    "printing 450",
    "scan two hundred",
    "stationery sale 1,250",
    "paid 800 for paper",
    "colour print 20 pages 1200",
)

_RECEIPT_SAMPLES = (
    "CITY PAPER SUPPLIES\nA4 Ream x2\nTotal Rs 1,800\nCash",
    "LANKA INK HOUSE\nToner cartridge\nRs 4,500\nThank you",
    "SHOP RENT RECEIPT\nAugust\nPaid Rs 15,000",
)


def _pick(options: tuple[str, ...], payload: bytes) -> str:
    digest = hashlib.sha256(payload).digest()
    return options[digest[0] % len(options)]


class StubTranscriber:
    name = "stub"

    def transcribe(self, audio: bytes, content_type: str) -> str:  # noqa: ARG002
        return _pick(_SPOKEN_SAMPLES, audio)


class StubOcrEngine:
    name = "stub"

    def extract_text(self, image: bytes, content_type: str) -> str:  # noqa: ARG002
        return _pick(_RECEIPT_SAMPLES, image)
