"""Render the Glaux Ledger app icons from the brand tokens.

Gold on nyx, which is the Glaux signature: the wordmark, the owl's eyes and the
primary button all read that way. Two bars of unequal length carry Ledger's own
meaning: entries in a book. No red, despite expense being half of what the app
records; at 48px on a home screen red reads as an error badge, not a category.

Pure stdlib. Pillow would be one import, but it is not a frontend dependency and
adding a build-time-only native package to save eighty lines is a poor trade.
Anti-aliasing comes from supersampling at 4x and box-filtering down.

    python tools/generate_icons.py
"""

import struct
import zlib
from pathlib import Path

NYX = (0x07, 0x0B, 0x12, 255)
GLEAM = (0xE9, 0xB4, 0x5C, 255)
GLEAM_SOFT = (0xF2, 0xC6, 0x74, 255)
CLEAR = (0, 0, 0, 0)

OUT = Path(__file__).resolve().parent.parent / "public"
SS = 4  # supersampling factor

Colour = tuple[int, int, int, int]


class Canvas:
    """A supersampled RGBA canvas. All geometry is given in final-image units."""

    def __init__(self, size: int) -> None:
        self.size = size
        self.hi = size * SS
        self.pixels = bytearray(CLEAR * (self.hi * self.hi))

    def rounded_rect(self, x: float, y: float, w: float, h: float, r: float, colour: Colour) -> None:
        x0, y0, x1, y1 = (round(v * SS) for v in (x, y, x + w, y + h))
        radius = r * SS
        for py in range(max(0, y0), min(self.hi, y1)):
            # Distance past the corner-centre band, so only corners round off.
            dy = max(y0 + radius - py, py - (y1 - radius - 1), 0)
            row = py * self.hi
            for px in range(max(0, x0), min(self.hi, x1)):
                dx = max(x0 + radius - px, px - (x1 - radius - 1), 0)
                if dx * dx + dy * dy <= radius * radius:
                    offset = (row + px) * 4
                    self.pixels[offset : offset + 4] = bytes(colour)

    def to_scanlines(self) -> bytes:
        """Box-filter SSxSS blocks down to one pixel each. This is the anti-aliasing."""
        out = bytearray()
        area = SS * SS
        for y in range(self.size):
            out.append(0)  # PNG filter type 0 for this scanline
            for x in range(self.size):
                r = g = b = a = 0
                for sy in range(SS):
                    row = ((y * SS + sy) * self.hi + x * SS) * 4
                    for sx in range(SS):
                        o = row + sx * 4
                        r += self.pixels[o]
                        g += self.pixels[o + 1]
                        b += self.pixels[o + 2]
                        a += self.pixels[o + 3]
                out += bytes((r // area, g // area, b // area, a // area))
        return bytes(out)


def write_png(path: Path, size: int, scanlines: bytes) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(scanlines, 9))
        + chunk(b"IEND", b"")
    )


def build(name: str, size: int, *, radius: float, scale: float) -> None:
    canvas = Canvas(size)
    canvas.rounded_rect(0, 0, size, size, size * radius, NYX)

    span = size * scale
    left = (size - span) / 2
    bar_h = span * 0.215
    gap = span * 0.16
    top = (size - (bar_h * 2 + gap)) / 2

    canvas.rounded_rect(left, top, span, bar_h, bar_h / 2, GLEAM)
    canvas.rounded_rect(left, top + bar_h + gap, span * 0.6, bar_h, bar_h / 2, GLEAM_SOFT)

    write_png(OUT / name, size, canvas.to_scanlines())
    print(f"  {name:24} {size}x{size}  {(OUT / name).stat().st_size:>6} bytes")


def build_favicon() -> None:
    """SVG for the browser tab: sharp at any size, and a fraction of the bytes."""
    gold = "rgb(233, 180, 92)"
    soft = "rgb(242, 198, 116)"
    (OUT / "favicon.svg").write_text(
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="rgb(7, 11, 18)"/>
  <rect x="21" y="36" width="58" height="12.5" rx="6.25" fill="{gold}"/>
  <rect x="21" y="55" width="34.8" height="12.5" rx="6.25" fill="{soft}"/>
</svg>
""",
        encoding="utf-8",
    )
    print(f"  {'favicon.svg':24} vector")


def main() -> None:
    print("Writing brand assets to public/\n")
    # 22% matches the favicon's rx and Android's own icon curvature closely enough.
    build("icon-192.png", 192, radius=0.22, scale=0.58)
    build("icon-512.png", 512, radius=0.22, scale=0.58)
    # Maskable art gets cropped to a circle by the launcher, so the ground must bleed to
    # the edges and everything meaningful has to sit inside the inner 80%.
    build("icon-maskable-512.png", 512, radius=0, scale=0.44)
    # iOS applies its own rounding and ignores alpha, so this stays a full-bleed square.
    build("apple-touch-icon.png", 180, radius=0, scale=0.58)
    build_favicon()


if __name__ == "__main__":
    main()
