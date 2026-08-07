"""Font registration for PDF reports.

Two honest limitations, both documented in the README rather than papered over:

1. No font files are committed to this repo. Drop TrueType files into the directory
   named by REPORT_FONT_DIR (default ``app/assets/fonts``) and they are picked up
   automatically; otherwise reports fall back to a Latin-only face.
2. ReportLab has no HarfBuzz, so even with a Sinhala or Tamil font installed it does not
   perform complex-script shaping. Conjuncts may not compose correctly. Amounts, dates
   and Latin text are unaffected. Rendering the report as HTML and printing from the
   browser is the workaround until this matters enough to justify a shaping engine.
"""

import logging
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# Preferred first. Each entry is (registered name, candidate filenames).
_CANDIDATES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Report", ("NotoSans-Regular.ttf", "DejaVuSans.ttf")),
    ("Report-Bold", ("NotoSans-Bold.ttf", "DejaVuSans-Bold.ttf")),
)

_FALLBACK = ("Helvetica", "Helvetica-Bold")

_resolved: tuple[str, str] | None = None


def report_fonts() -> tuple[str, str]:
    """Returns (regular, bold) font names, registering them on first use."""
    global _resolved
    if _resolved is not None:
        return _resolved

    registered: list[str] = []
    for name, filenames in _CANDIDATES:
        path = next((FONT_DIR / f for f in filenames if (FONT_DIR / f).is_file()), None)
        if path is None:
            break
        try:
            pdfmetrics.registerFont(TTFont(name, str(path)))
            registered.append(name)
        except Exception:
            logger.warning("Could not register report font %s", path, exc_info=True)
            break

    if len(registered) == len(_CANDIDATES):
        _resolved = (registered[0], registered[1])
    else:
        logger.info(
            "No Unicode report fonts in %s; falling back to %s. Sinhala and Tamil text "
            "will not render in PDF exports.",
            FONT_DIR,
            _FALLBACK[0],
        )
        _resolved = _FALLBACK

    return _resolved


def supports_unicode() -> bool:
    """False when reports are running on the Latin-only fallback."""
    return report_fonts() != _FALLBACK
