"""Put a real clip and a real receipt through the real provider, and show the result.

The adapter is unit-tested against a fake transport, which proves the request shape is
right and nothing more. Whether `gpt-4o-mini-transcribe` can follow a shopkeeper
switching between Sinhala and English mid-sentence is not a question a mock can answer,
and it is the question that decides whether two of the three advertised entry methods
are real.

    cd backend
    OPENAI_API_KEY=sk-... python tools/check_openai.py --audio clip.m4a --image bill.jpg

Either argument may be omitted to check just the one path. Costs a fraction of a cent
per run and nothing is written to the database.
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services.parsing.interfaces import CategoryRef, ParsingError  # noqa: E402
from app.services.parsing.openai_adapter import (  # noqa: E402
    OpenAIExtractor,
    OpenAITranscriber,
    OpenAIVisionOcr,
)
from app.services.seed import DEFAULT_CATEGORIES  # noqa: E402

# The same starter set a new shop is given, so the extraction is judged against the
# categories a real first-day user would actually have.
CATEGORIES = [
    CategoryRef(id=uuid.uuid4(), name=name, type=entry_type.value)
    for name, entry_type in DEFAULT_CATEGORIES
]

CONTENT_TYPES = {
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def content_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix not in CONTENT_TYPES:
        raise SystemExit(
            f"Don't know the media type for {suffix!r}. Supported: "
            f"{', '.join(sorted(CONTENT_TYPES))}"
        )
    return CONTENT_TYPES[suffix]


def show_extraction(text: str) -> None:
    started = time.monotonic()
    fields = OpenAIExtractor().extract(text, CATEGORIES)
    elapsed = time.monotonic() - started

    category = next((c.name for c in CATEGORIES if c.id == fields.category_id.value), None)
    print(f"  extracted in {elapsed:.1f}s")
    print(f"    amount        {fields.amount.value}  ({fields.amount.confidence:.2f})")
    print(f"    category      {category}  ({fields.category_id.confidence:.2f})")
    print(f"    direction     {fields.entry_type.value}")
    print(f"    note          {fields.note.value}")
    print(f"    on credit     {fields.on_credit.value}")
    print(f"    counterparty  {fields.counterparty.value}")


def check_audio(path: Path) -> None:
    print(f"\nvoice  {path.name}")
    started = time.monotonic()
    text = OpenAITranscriber().transcribe(path.read_bytes(), content_type_for(path))
    print(
        f"  transcribed in {time.monotonic() - started:.1f}s using "
        f"{settings.openai_transcribe_model}"
    )
    print(f"    {text!r}")
    if text.strip():
        show_extraction(text)
    else:
        print("  nothing came back, the route would return 422 here")


def check_image(path: Path) -> None:
    print(f"\nphoto  {path.name}")
    started = time.monotonic()
    text = OpenAIVisionOcr().extract_text(path.read_bytes(), content_type_for(path))
    print(f"  read in {time.monotonic() - started:.1f}s using {settings.openai_extract_model}")
    for line in text.splitlines()[:12]:
        print(f"    {line}")
    if text.strip():
        show_extraction(text)
    else:
        print("  nothing came back, the route would return 422 here")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, help="a clip of someone recording an entry")
    parser.add_argument("--image", type=Path, help="a photographed bill or receipt")
    args = parser.parse_args()

    if not args.audio and not args.image:
        parser.error("give --audio, --image, or both")
    if not settings.openai_api_key:
        raise SystemExit(
            "OPENAI_API_KEY is not set. Put it in backend/.env or the environment; this "
            "script talks to the live API and cannot run without it."
        )

    for path in (args.audio, args.image):
        if path and not path.exists():
            raise SystemExit(f"{path} does not exist")

    try:
        if args.audio:
            check_audio(args.audio)
        if args.image:
            check_image(args.image)
    except ParsingError as exc:
        print(f"\nfailed: {exc}")
        return 1

    print("\nBoth paths return a draft the entry sheet can open. Nothing was saved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
