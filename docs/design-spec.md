# Glaux Ledger design spec

The brief: calm, fast, trustworthy. Closer to a well-made instrument than a consumer app
or a SaaS dashboard. This is a tool used standing up, one-handed, for eight seconds at a
time, with a customer waiting.

Everything below follows from that, and from one constraint above it: Ledger is a Glaux
product and has to look like one.

## The family problem

Glaux already has a design system. [useglaux](https://useglaux.com) and Glaux Markets both
run **NYX**, a dark observatory palette where gleam gold means attention, verdigris means
upside, and ember means downside, set in Marcellus, Schibsted Grotesk and Spline Sans Mono.
Markets got there first and the company hub was ported from it.

Ledger cannot simply be a third instance of that, and not only because two products
already look alike. Markets is read at a desk, often at night, where an unlit instrument
panel is exactly right. Ledger is read at a shop counter in Sri Lankan daylight, on a
mid-range phone at partial brightness. A dark interface cannot outrun the sun: in high
ambient light its effective contrast collapses, while a light one holds.

So Ledger is **the daylight member of NYX**. Every identity-carrying token stays: the
brand colours, the type trio, the 9/14/20 radius scale, the three-duration motion
language. Only the surface inverts. That is enough to make Ledger unmistakably a Glaux
product without making it a recolour of Markets.

The inversion goes deeper than the background. The hub is a cool ground with a warm gleam
bleeding across it. Ledger is a warm ground, the paper ledger this app replaces, with
cool nyx ink on top. Same tension, reversed.

One mapping is exact rather than merely consistent: Markets colours upside verdigris and
downside ember. Ledger colours income verdigris and expense ember. Same meaning, different
domain.

## Principle: colour carries meaning, nothing else

Chrome (headers, cards, borders, backgrounds) stays monochrome. Colour appears only
where it means something: money in, money out, or an action to take. If a shop owner
glances at the screen for one second, the only things coloured should be the numbers they
came to check.

Gold is the one exception, and it is a narrow one. It marks the primary action and the
fields a parser was unsure about, which is the brand's own meaning for gleam, attention.
It never appears next to a number.

## Palette

The brand primitives are shared verbatim across Glaux:

| Token | Hex | Role |
| --- | --- | --- |
| `nyx` | `#070B12` | Primary text, and the ground of every app icon. |
| `gleam` | `#E9B45C` | Gold. A **fill** only, always under dark ink. |
| `verdigris` | `#45B98E` | The upside hue, from which `income` derives. |
| `ember` | `#D85F55` | The downside hue, from which `expense` derives. |

Ledger's own ground and the on-light siblings derived from those primitives:

| Token | Hex | Role |
| --- | --- | --- |
| `paper` | `#FAF7F2` | App background. Warm off-white, the ledger-book reference. |
| `card` | `#FFFFFF` | Cards and sheets, to lift off `paper`. |
| `sunk` | `#F3F2EF` | Pressed states and wells. |
| `line` | `#E2E4E6` | Borders and dividers: mist over paper, not neutral grey. |
| `ink` | `#070B12` | Primary text. Nyx itself. |
| `mute` | `#5E6F8A` | Secondary text, labels, timestamps. |
| `accent` | `#956400` | Gold **as text or icon**. |
| `accent-edge` | `#B48122` | Gold **as border or chart fill**. |
| `accent-fill` | `#E9B45C` | Gold as a fill. Gleam, unmodified. |
| `income` | `#007E57` | Money in. |
| `expense` | `#BD473F` | Money out. |

### Why the brand colours could not be used directly

NYX was tuned to glow on near-black. On paper the same values fail, and not marginally:

| Primitive | On paper | Verdict |
| --- | --- | --- |
| `gleam` | 1.76:1 | Effectively invisible |
| `verdigris` | 2.29:1 | Fails |
| `ember` | 3.45:1 | Fails body text |
| `mist` | 2.49:1 | Fails |

[`frontend/tools/derive_palette.py`](../frontend/tools/derive_palette.py) resolves this. It
holds each hue fixed in OKLCH and walks lightness down until the ratio clears, so the
on-light siblings pass contrast while drifting **under 3 degrees of hue**, so the eye still
reads them as the same brand colours. Run it before changing any colour; it prints the
values to paste into `index.css`.

Gold is the one that could not be darkened into a fill, because a dark gold is just brown.
So gleam ships unmodified as a *fill* with nyx ink on top, which reads at 10.46:1 and is
how the brand already uses it; see the "Open Glaux Markets" button on the hub. Only gold
*text* and gold *strokes* use the darkened siblings.

### Contrast

Measured against `paper` (`#FAF7F2`), the worst case, since `card` white is lighter:

- `ink`: 18.4:1
- `income`: 4.8:1
- `expense`: 4.8:1
- `accent`: 4.8:1
- `mute`: 4.8:1
- `accent-edge`: 3.2:1 (borders and chart fills only, never text)
- `nyx` on `accent-fill`: 10.5:1

Every text value clears WCAG AA with headroom deliberately built in, so nothing ships
sitting exactly on 4.5:1 where a later tweak would quietly push it under.

### Colour is never the only signal

Roughly 1 in 12 men has a red-green colour vision deficiency, and income/expense is
exactly a red-green distinction. Every amount therefore carries an explicit `+` or `−`
prefix, and expense rows are additionally marked by position and label. The colour is
reinforcement, not the message.

## Type

The Glaux trio, unchanged from the parent system. What differs is which face does the
heavy lifting.

**Marcellus** for brand moments: the wordmark, screen titles. It is what the GLAUX
wordmark is set in, so it carries the brand instantly. It ships a single weight, so no
bold utility is ever applied to it; the browser would synthesise a smeared faux-bold.

**Schibsted Grotesk** for body, labels, and UI. Highly legible at small sizes and slightly
technical in feel.

**Spline Sans Mono** for every figure. In the parent system this is the labels-and-data
face; here it does more work than that, because a ledger lives or dies on digits lining up
down a column. This is also a genuine improvement on what Ledger had before: the previous
spec used Fraunces for figures with a caveat that it might need swapping if it turned out
not to expose `tnum`. A monospace face guarantees alignment structurally rather than via an
optional OpenType feature, so the caveat is gone.

Marcellus is deliberately *not* used for money. It is a display serif with one weight and
no tabular figures, exactly wrong for a column of amounts meant to be scanned rather than
admired.

**Noto** covers Sinhala and Tamil, which none of the three do. The stack falls through
per-glyph, so a Sinhala category name renders correctly beside Latin text with no language
switching.

Font stack:

```
--font-display: "Marcellus", "Noto Serif Sinhala", Georgia, serif;
--font-body:    "Schibsted Grotesk", "Noto Sans Sinhala", "Noto Sans Tamil", system-ui, sans-serif;
--font-mono:    "Spline Sans Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

### Figures

`.tabular` sets the mono face *and* `font-variant-numeric: tabular-nums`, the latter for
the fallback stack. Every amount in the app carries it.

The currency symbol renders at `0.62em` and 70% opacity rather than at figure size. On a
monospace face at hero scale, `Rs` and `2,700` would otherwise be equally loud with a full
mono space between them; the figure is the content and the symbol is a unit label.

### Eyebrow labels

Section labels (`TODAY`, `NET`, `BY CATEGORY`) are mono caps on `0.16em` tracking, the
parent system's signature for anything that *names* data rather than being data. Available
as the `eyebrow` utility.

## Layout: Quick Entry

The screen the owner sees twenty times a day. Designed for one thumb on a phone held at
counter height.

```
┌──────────────────────────────┐
│ Today            Sat 2 Aug   │  ← sticky, never scrolls away
│                              │
│   + Rs 12,450                │  ← Spline Sans Mono, ~44px, income
│   − Rs 3,200                 │  ← expense
│   ─────────────              │
│   Net Rs 9,250               │
├──────────────────────────────┤
│                              │
│  ┌────────────────────────┐  │
│  │   ●  Record voice      │  │  ← 88px tall, primary
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   ▢  Take photo        │  │  ← 72px
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   +  Type it           │  │  ← 72px
│  └────────────────────────┘  │
│                              │
├──────────────────────────────┤
│ Recent                       │
│ Printing      + Rs 450  ↩    │  ← undo stays available
│ Stationery    + Rs 120  ↩    │
└──────────────────────────────┘
```

Decisions:

- **The day total is sticky.** The brief calls for it visible without scrolling; making it
  a fixed header means it is visible *always*, including mid-entry.
- **Three targets, vertically stacked, largest first.** Voice is the fastest input while
  handling a customer, so it gets the most area. Stacking beats a grid because a thumb
  arcs vertically, and full-width targets cannot be mis-tapped horizontally.
- **All targets clear 72px**, well above the 44px minimum, because this gets tapped
  without looking.
- **Recent entries carry undo**, not just history. The most likely error is a wrong entry
  ten seconds ago, and fixing it should not require navigating to another screen.

### The draft confirmation sheet

Every input path (voice, photo, manual) lands in the same bottom sheet. Nothing saves
without confirmation, since parsing will sometimes be wrong.

A bottom sheet rather than a centred modal: it sits in the thumb's natural arc, and a
centred dialog on a phone puts its buttons where the hand isn't.

- Amount is the hero field, autofocused, `inputmode="decimal"` so the numeric keypad
  opens immediately.
- Categories are chips, not a `<select>`. A dropdown costs two taps and hides the options;
  five chips cost one tap and are visible at a glance.
- Fields the parser was unsure about are outlined in `accent-edge` with a quiet "check this"
  label, drawing the eye to what needs review rather than making everything look equally
  uncertain.
- The raw transcript is shown small underneath, so a wrong parse is diagnosable rather
  than mysterious.

## Layout: Dashboard

```
┌──────────────────────────────┐
│  [ Day ] [ Week ] [ Month ]  │  ← segmented, Day default
│                              │
│      Net                     │
│      Rs 9,250                │  ← Spline Sans Mono, ~56px
│                              │
│   In  + Rs 12,450            │
│   Out − Rs  3,200            │
├──────────────────────────────┤
│  Printing                    │
│  ████████████░░░  Rs 6,400   │
│  Stationery Sale             │
│  ███████░░░░░░░░  Rs 4,200   │
│  Scanning                    │
│  ███░░░░░░░░░░░░  Rs 1,850   │
└──────────────────────────────┘
```

Horizontal bars, not a pie chart. Pie slices are hard to compare and impossible to label
at phone width; bars sort by magnitude and let the amounts right-align in tabular figures
so they read as a column.

Day is the default period, not month: the question being asked is almost always "how did
today go".

## Motion

Deliberately almost none. One moment earns it: confirming an entry. The sheet dismisses
and the amount counts up into the day's total over ~450ms, which confirms the entry
landed without an alert to dismiss.

Everything else (page transitions, hovers, list rendering) is instant.

Under `prefers-reduced-motion: reduce`, the count-up becomes an immediate value change.
The total still updates and the feedback still happens; only the interpolation is
dropped. Implemented as a media query hook rather than by disabling animation wholesale,
so nothing becomes unresponsive.

### The public pages are the exception, on purpose

Everything above describes the app, and the reason for it is the counter: a shopkeeper is
mid-transaction, one-handed, with a customer waiting, and a control that moves between the
glance and the tap costs real time.

None of that is true of the landing page, the sign-in screen or the legal documents. They
are read once, by a stranger with both hands and no queue, who is deciding whether to
trust this with their accounts. The thing most likely to convince them is watching the
product work. So the expressive half of the parent system's motion language lives on those
three surfaces and stops at the sign-in wall: an entrance stagger, a header that condenses
on scroll, hover choreography on anything pressable, and a ledger card in the hero that
records an entry by voice, by photo and by hand on a loop.

The rules that do not bend:

- It stays CSS. This is the first paint someone gets over mobile data, and an animation
  library to move a heading would be paid for by the person being convinced. The whole
  layer is in the `PUBLIC SURFACES` block of `index.css`.
- Anything looping is gated on being in the viewport, so a timer chain is never animating
  something behind the fold.
- Reduced motion gets the end state rather than the start. The hero demo renders the
  finished day, with the same figures, having moved nothing.
- The demo card is `aria-hidden`. Invented amounts announced beside real ones would be
  worse than no illustration at all.

## Quality floor

- Responsive to 320px (iPhone SE) without horizontal scroll.
- Visible focus states everywhere: a 2px `accent` ring at 2px offset. Never `outline: none`
  without a replacement.
- Tap targets ≥44px; primary actions ≥72px.
- Safe-area insets respected so the sticky footer clears the iOS home indicator.
- Semantic landmarks and live regions, so the running total is announced when it changes.

## Currency

Amounts render as `Rs 12,450`: symbol, space, thousands-separated, decimals hidden when
`.00`. Shop amounts are usually whole rupees and trailing zeros are noise. The currency
comes from `businesses.currency`, so this is not hardcoded.

The shop picks it, along with its timezone, when it registers. Both are then fixed for
the life of the shop, because both reinterpret every figure already recorded: a currency
change restates the whole book, and a timezone change moves the day boundary that decides
which date a 9pm sale belongs to. Fixed values asked for once, at the only moment they
can be answered honestly, rather than defaulted quietly and refused later in Settings.

Five currencies are offered, the five with a symbol in `format.ts` and in the report
font. A sixth would record and total correctly and then read `AUD 4,500` on every screen
and in the PDF handed to a bank.
