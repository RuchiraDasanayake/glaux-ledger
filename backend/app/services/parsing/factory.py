from dataclasses import dataclass
from functools import lru_cache

from app.core.config import settings
from app.services.parsing.interfaces import EntryExtractor, OcrEngine, Transcriber
from app.services.parsing.rules import RuleBasedExtractor
from app.services.parsing.stub import StubOcrEngine, StubTranscriber


@dataclass(frozen=True, slots=True)
class Parsers:
    transcriber: Transcriber
    ocr: OcrEngine
    extractor: EntryExtractor


@lru_cache
def get_parsers() -> Parsers:
    """The one place a provider is chosen. Routes never import an implementation."""
    if settings.parser_provider == "openai":
        # Imported lazily so the default path never touches the HTTP adapter.
        from app.services.parsing.openai_adapter import (
            OpenAIExtractor,
            OpenAITranscriber,
            OpenAIVisionOcr,
        )

        return Parsers(
            transcriber=OpenAITranscriber(),
            ocr=OpenAIVisionOcr(),
            extractor=OpenAIExtractor(),
        )

    return Parsers(
        transcriber=StubTranscriber(),
        ocr=StubOcrEngine(),
        # Rule-based even in stub mode: it produces a genuinely useful draft from the
        # sample text, so the confirm flow behaves as it will in production.
        extractor=RuleBasedExtractor(),
    )
