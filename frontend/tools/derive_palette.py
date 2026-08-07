"""Derive the Ledger daylight palette from the Glaux NYX brand primitives.

NYX was tuned to glow on near-black. Dropped onto paper the same hex values fail
badly: gleam on white is about 1.8:1, nowhere near the 4.5:1 body text needs. So
each brand colour gets an on-light sibling: same hue and chroma in OKLCH, lightness
walked down until it clears the target. Hue is what the eye reads as brand identity,
so holding it fixed keeps the family resemblance the darkening would otherwise cost.

Run when a brand colour changes; paste the results into src/index.css.

    python tools/derive_palette.py
"""

import math

# ---- Glaux NYX brand primitives, shared with useglaux and Glaux Markets ----
NYX = "#070b12"
GLEAM = "#e9b45c"
VERDIGRIS = "#45b98e"
EMBER = "#d85f55"
MIST = "#8da0bc"

# Ledger's own ground: warm paper, because this app replaces a paper ledger and
# because warm-on-cool is the exact inverse of the hub's cool-ground-warm-gleam.
PAPER = "#faf7f2"
CARD = "#ffffff"

# Targets carry headroom over the WCAG minima (4.5 for body text, 3.0 for non-text)
# so a value never ships sitting exactly on the line, where a later tweak to the
# background or a rounding difference would quietly push it under.
BODY_TEXT = 4.75
NON_TEXT = 3.2


def to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def from_linear(c: float) -> float:
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(max(0.0, min(1.0, c)) * 255):02x}" for c in rgb)


def luminance(value: str) -> float:
    r, g, b = (to_linear(c) for c in hex_to_rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def to_oklab(value: str) -> tuple[float, float, float]:
    r, g, b = (to_linear(c) for c in hex_to_rgb(value))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def from_oklab(lab: tuple[float, float, float]) -> str:
    L, a, b = lab
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = (v**3 for v in (l_, m_, s_))
    return rgb_to_hex(
        (
            from_linear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            from_linear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            from_linear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
        )
    )


def darken_until(source: str, background: str, target: float) -> str:
    """Walk OKLCH lightness down, holding hue and chroma, until the ratio clears."""
    L, a, b = to_oklab(source)
    if contrast(source, background) >= target:
        return source
    for step in range(1, 1001):
        candidate = from_oklab((L * (1 - step / 1000), a, b))
        if contrast(candidate, background) >= target:
            return candidate
    return "#000000"


def blend(top: str, bottom: str, alpha: float) -> str:
    """Flatten `top` at `alpha` over `bottom`, so hairlines can ship as solid hex."""
    t, b = hex_to_rgb(top), hex_to_rgb(bottom)
    return rgb_to_hex(tuple(b[i] + (t[i] - b[i]) * alpha for i in range(3)))  # type: ignore[arg-type]


def hue_shift(before: str, after: str) -> float:
    """Degrees of hue drift, to prove the darkening kept the brand colour."""
    _, a1, b1 = to_oklab(before)
    _, a2, b2 = to_oklab(after)
    delta = abs(math.degrees(math.atan2(b2, a2)) - math.degrees(math.atan2(b1, a1)))
    return min(delta, 360 - delta)


def main() -> None:
    print("Brand primitives dropped straight onto paper, and why they need work:\n")
    for name, value in (
        ("gleam", GLEAM),
        ("verdigris", VERDIGRIS),
        ("ember", EMBER),
        ("mist", MIST),
    ):
        ratio = contrast(value, PAPER)
        verdict = "ok" if ratio >= BODY_TEXT else f"FAILS body text (needs {BODY_TEXT})"
        print(f"  {name:10} {value}  on paper {ratio:5.2f}:1   {verdict}")

    print("\nDerived on-light siblings (hue held, lightness walked down):\n")
    derived = {
        "gleam-ink": (GLEAM, BODY_TEXT, "gold as text or icon"),
        "gleam-edge": (GLEAM, NON_TEXT, "gold as border or chart fill"),
        "income": (VERDIGRIS, BODY_TEXT, "income figures"),
        "expense": (EMBER, BODY_TEXT, "expense figures"),
        "mute": (MIST, BODY_TEXT, "secondary text"),
        "line-strong": (MIST, NON_TEXT, "hairline that must be seen"),
    }
    for name, (source, target, use) in derived.items():
        result = darken_until(source, PAPER, target)
        print(
            f"  --color-{name:12} {result}  "
            f"{contrast(result, PAPER):5.2f}:1 on paper  "
            f"hue drift {hue_shift(source, result):4.1f} deg   ({use})"
        )

    # Hairlines are mist flattened over paper rather than a neutral grey, so even the
    # dividers carry the brand's cool cast against the warm ground.
    print("\nSurfaces and hairlines (mist flattened over paper):\n")
    for name, alpha in (("line", 0.22), ("line-soft", 0.12), ("sunk", 0.06)):
        value = blend(MIST, PAPER, alpha)
        print(f"  --color-{name:12} {value}  (mist at {alpha:.0%})")

    print("\nFixed pairings that must also hold:\n")
    for label, fg, bg in (
        ("nyx ink on paper", NYX, PAPER),
        ("nyx ink on card", NYX, CARD),
        ("nyx ink on gleam fill", NYX, GLEAM),
    ):
        ratio = contrast(fg, bg)
        print(f"  {label:24} {ratio:5.2f}:1  {'ok' if ratio >= BODY_TEXT else 'FAIL'}")

    # Not shipped. Recorded because it shows the primitives are night-native: they need
    # no adjustment on nyx, which is precisely why they needed so much on paper.
    print("\nReference: the same primitives on the parent system's nyx ground:\n")
    for label, fg in (("paper", PAPER), ("gleam", GLEAM), ("verdigris", VERDIGRIS), ("ember", EMBER)):
        print(f"  {label:24} {contrast(fg, NYX):5.2f}:1 on nyx")


if __name__ == "__main__":
    main()
