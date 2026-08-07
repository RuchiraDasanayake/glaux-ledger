import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "@/components/Reveal";
import { useCountUp } from "@/hooks/useCountUp";
import { useInView } from "@/hooks/useInView";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScrolled } from "@/hooks/useScrolled";
import { BILLING } from "@/lib/billing";
import { formatAmount } from "@/lib/format";
import { delay } from "@/lib/motion";

/**
 * What the root URL used to be was a sign-in form, which answers no question a stranger
 * has. This does: what it is, what it costs, and where to start.
 *
 * The dark hero is the one place the parent system's night palette appears, the same
 * licence the sign-in brand panel takes. Everything from the fold down returns to
 * daylight, because that is what the product actually looks like and a landing page that
 * misrepresents that is just a more expensive bounce.
 *
 * This page animates far more than the app does, and deliberately. The rule inside is
 * that nothing moves under the thumb, because a shopkeeper is mid-transaction with a
 * customer waiting. Nobody is mid-transaction here. They are deciding, they have both
 * hands, and the thing most likely to convince them is watching the product work.
 */

/**
 * The measure and gutter every band on this page shares.
 *
 * The ceiling has been raised three times and is now gone, for the reason it kept being
 * raised: every value of it just moved the monitor size at which the page turned into a
 * column with a hand's width of blank either side. At 92rem a 2560px screen was 57%
 * content; at 120rem it was 75% and still read as centred next to the app, which has no
 * cap at all. So it matches the app now: content fills what it is given and the gutter
 * grows instead.
 *
 * What a cap was really protecting was the line length, and that is a property of the
 * prose, not of the page. So the prose carries it: the hero paragraph, the way cards and
 * the capability columns each hold their own measure below, which keeps the lines
 * readable at any width without deciding for the whole page how wide a monitor is
 * allowed to be.
 */
const BAND = "mx-auto w-full max-w-6xl px-6 xl:max-w-none xl:px-10 2xl:px-16";

export function Landing() {
  return (
    <div className="min-h-dvh bg-paper">
      <TopBar />
      <Hero />
      <Ways />
      <Capabilities />
      <Pricing />
      <Closing />
      <Footer />
    </div>
  );
}

/**
 * Transparent over the hero and a frosted paper bar below it.
 *
 * Fixed rather than absolute so the call to action is reachable from anywhere on the
 * page: the old header scrolled away at the fold and left a visitor who had read the
 * whole thing with nothing to press but the browser's back button.
 */
function TopBar() {
  const scrolled = useScrolled(32);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 border-b transition-colors duration-300 ${
        scrolled
          ? "border-line bg-paper/80 backdrop-blur-md"
          : "border-transparent"
      }`}
    >
      <div className={`${BAND} flex items-center justify-between py-4`}>
        <Link
          to="/"
          className={`font-display text-xl tracking-tight transition-colors duration-300 ${
            scrolled ? "text-ink" : "text-[#f2f5fa]"
          }`}
        >
          Glaux Ledger
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/login"
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-300 sm:px-4 ${
              scrolled
                ? "text-mute hover:text-ink"
                : "text-[#c6d3e4] hover:text-white"
            }`}
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="sheen rounded-md bg-accent-fill px-3 py-2 text-sm font-medium
              text-nyx transition-colors hover:bg-accent-fill-hover sm:px-4"
          >
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-nyx pt-28 pb-20 sm:pt-36 lg:pb-28">
      <HeroBackdrop />

      <div
        className={`${BAND} relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]`}
      >
        <div>
          <p
            style={delay(0)}
            className="rise text-xs tracking-[0.18em] text-[#8da0bc] uppercase"
          >
            Bookkeeping for small shops
          </p>
          <h1
            style={delay(90)}
            // Capped so it still breaks over two lines once the band is uncapped. On one
            // line at 72px it is a long thin strip of text with the weight of a caption.
            className="rise font-display mt-4 text-4xl leading-[1.08] tracking-tight
              text-[#f2f5fa] sm:text-5xl lg:text-6xl 2xl:max-w-4xl 2xl:text-7xl"
          >
            A day&rsquo;s trading, recorded in seconds.
          </h1>
          {/* The measure grows a little with the band, but only a little: the headline
              can have the extra width, a paragraph cannot. */}
          <p
            style={delay(180)}
            className="rise mt-5 max-w-lg text-lg leading-relaxed text-[#a9b8ce]
              2xl:mt-7 2xl:max-w-xl 2xl:text-xl"
          >
            Say it, photograph the receipt, or type it. Sales, supplier bills,
            rent and wages all land in one book you can hand to an accountant or
            a bank.
          </p>

          <div
            style={delay(270)}
            className="rise mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              to="/register"
              className="sheen flex min-h-12 items-center justify-center rounded-md bg-accent-fill
                px-7 font-medium text-nyx transition-colors hover:bg-accent-fill-hover"
            >
              Start your {BILLING.trialDays} free days
            </Link>
            <Link
              to="/login"
              className="flex min-h-12 items-center justify-center rounded-md border
                border-[#283346] px-7 font-medium text-[#c6d3e4] transition-colors
                hover:border-[#3d4c65] hover:text-white"
            >
              Sign in
            </Link>
          </div>

          <p style={delay(350)} className="rise mt-4 text-sm text-[#7a8faf]">
            No card. Nothing to install. Works on the phone already behind the
            counter.
          </p>
        </div>

        {/* Capped and pushed to the right edge. Left to fill its half of an uncapped
            band it becomes a 1200px-wide card whose rows put a category name and its
            amount a foot apart, which is the shape of the thing this page is claiming
            to have fixed. */}
        <div
          style={delay(220)}
          className="rise w-full xl:ml-auto xl:max-w-2xl 2xl:max-w-3xl"
        >
          <LedgerDemo />
        </div>
      </div>

      {/* The edge of the page, rather than a butt join between two flat fills. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(233,180,92,0.42) 50%, transparent)",
        }}
      />
    </section>
  );
}

/**
 * Three layers: ruled paper for the thing being replaced, two gold washes drifting on
 * different periods for depth, and nothing that repaints. All of it is transform-only
 * animation on elements the compositor can hand to the GPU once and leave alone.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="ruled-nyx absolute inset-0" />
      <div
        className="drift-near absolute -top-52 -right-40 size-[44rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(233,180,92,0.20) 0%, rgba(233,180,92,0) 62%)",
        }}
      />
      <div
        className="drift-far absolute -bottom-64 -left-52 size-[38rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(69,185,142,0.12) 0%, rgba(69,185,142,0) 66%)",
        }}
      />
    </div>
  );
}

type DemoRow = {
  key: string;
  name: string;
  note: string;
  amount: number;
  up: boolean;
};

/**
 * Where the day stands before the demo records anything. Money has gone both ways
 * already, because a shop whose costs are all zero is not one this is for.
 *
 * Exactly `ROWS_SHOWN` of them, so the list is full from the first frame and stays full
 * when the loop resets. Every name is a category the app actually seeds, and no two
 * adjacent rows share one: the same name twice in a row reads as a double entry, which
 * is the one thing a book is not supposed to look like it has.
 */
const OPENING_ROWS: DemoRow[] = [
  {
    key: "opening-sale",
    name: "Stationery Sale",
    note: "Files, pens",
    amount: 3450,
    up: true,
  },
  {
    key: "opening-scan",
    name: "Scanning",
    note: "12 pages",
    amount: 150,
    up: true,
  },
  {
    key: "opening-utilities",
    name: "Utilities",
    note: "Water bill",
    amount: 620,
    up: false,
  },
  {
    key: "opening-transport",
    name: "Transport",
    note: "Three-wheeler, stock run",
    amount: 480,
    up: false,
  },
];

/**
 * The card is a fixed height and the list inside it is the reason it can be.
 *
 * A row is two lines of text and its padding, pinned rather than left to the content, so
 * the list can be given an exact height and clip whatever the demo pushes past it. Left
 * to grow, the card would gain a row every few seconds and shove the whole page down
 * while someone was reading it, which is both the worst thing an animation can do and
 * the one fault the app itself has tests against.
 */
const ROW_HEIGHT = 60;
const ROWS_SHOWN = 4;
/** Four rows, the hairlines between them, and the list's own top and bottom border. */
const LIST_HEIGHT = ROWS_SHOWN * ROW_HEIGHT + (ROWS_SHOWN - 1) + 2;

/**
 * One pass through the three ways in. The numbers are chosen so the running total lands
 * on a plausible day rather than drifting somewhere absurd, and so the day stays in
 * credit throughout: a hero showing a shop losing money is an odd thing to sell.
 */
const CAPTURES = [
  {
    icon: MicIcon,
    status: "Listening",
    heard: "\u201cprinting one thousand two hundred\u201d",
    row: {
      key: "capture-print",
      name: "Printing",
      note: "Heard as printing",
      amount: 1200,
      up: true,
    },
  },
  {
    icon: CameraIcon,
    status: "Reading the receipt",
    heard: "Ranjith Traders \u00b7 2,400 \u00b7 due 12 Aug",
    row: {
      key: "capture-stock",
      name: "Stock & Supplies",
      note: "Ranjith Traders, on account",
      amount: 2400,
      up: false,
    },
  },
  {
    icon: KeyboardIcon,
    status: "Typing",
    heard: "Stationery sale \u00b7 2,250",
    row: {
      key: "capture-sale",
      name: "Stationery Sale",
      note: "Counter sale",
      amount: 2250,
      up: true,
    },
  },
] as const;

/**
 * Capture, then settle, three times over, then hold the finished day long enough to read
 * before starting again. Durations are the timeline: `phase` decides what the strip shows
 * and how many entries have landed, which is everything else on the card.
 */
const TIMELINE = [
  { phase: "capturing", capture: 0, ms: 1900 },
  { phase: "landed", capture: 0, ms: 2100 },
  { phase: "capturing", capture: 1, ms: 1900 },
  { phase: "landed", capture: 1, ms: 2100 },
  { phase: "capturing", capture: 2, ms: 1900 },
  { phase: "landed", capture: 2, ms: 3800 },
] as const;

const LAST_STEP = TIMELINE.length - 1;

/**
 * A rendering of the real interface rather than a screenshot: it stays honest through
 * restyles, weighs nothing, and reflows on a phone instead of becoming a 300px-wide
 * illegible image of a phone.
 *
 * It also runs, which is the point. Describing voice capture costs a paragraph nobody
 * finishes; showing an entry arrive from it costs two seconds and no reading. The loop
 * only turns while the card is on screen, since a timer chain animating something behind
 * the fold is a battery cost with no viewer.
 */
function LedgerDemo() {
  const reducedMotion = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });
  // One counter for both positions in the loop: which step, and which time round. The
  // second is what tells the list it is starting the day again rather than continuing.
  const [tick, setTick] = useState(0);

  const running = inView && !reducedMotion;
  const step = reducedMotion ? LAST_STEP : tick % TIMELINE.length;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setTick((n) => n + 1), TIMELINE[step].ms);
    return () => clearTimeout(timer);
  }, [running, step]);

  // Reduced motion gets the end of the loop as a still: the same information, arrived at
  // without anything having moved.
  const current = TIMELINE[step];
  const landed = current.capture + (current.phase === "landed" ? 1 : 0);
  const capture = CAPTURES[current.capture];

  const recorded = [
    ...CAPTURES.slice(0, landed)
      .map(({ row }) => row as DemoRow)
      .reverse(),
    ...OPENING_ROWS,
  ];

  // Totals count the whole day; the list only has room for the top of it. Summing what
  // is on screen would make the figures fall as the day filled up.
  const income = recorded
    .filter((row) => row.up)
    .reduce((sum, row) => sum + row.amount, 0);
  const outgoing = recorded
    .filter((row) => !row.up)
    .reduce((sum, row) => sum + row.amount, 0);

  // One more row than fits. It is the one being pushed out of the clip as the new entry
  // grows in, and rendering the rest of the day underneath it would be invisible work.
  const entries = recorded.slice(0, ROWS_SHOWN + 1);

  const net = useCountUp(income - outgoing, 600);

  // The supplier invoice is read off a photo and is not paid yet, so the unpaid list
  // grows with it. Credit purchases are the thing a paper book loses track of first.
  const onAccount = landed >= 2;

  return (
    <div ref={ref} aria-hidden="true" className="relative">
      <div
        className="rounded-xl border border-[#1c2637] bg-[#0c1220] p-5 shadow-2xl
          sm:p-6"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs tracking-[0.16em] text-[#7a8faf] uppercase">
            Today
          </span>
          <span className="text-xs text-[#7a8faf]">Nimal Stationers</span>
        </div>

        <p className="mt-3 text-3xl font-semibold tracking-tight text-[#f2f5fa] tabular-nums sm:text-4xl">
          {formatAmount(Math.round(net))}
        </p>
        <p className="mt-1 text-sm text-[#6f8098]">
          In <span className="text-[#5f9f86]">{formatAmount(income)}</span>
          <span className="px-1.5 text-[#3b4759]">&middot;</span>
          Out <span className="text-[#c47a73]">{formatAmount(outgoing)}</span>
        </p>

        <CaptureStrip
          icon={capture.icon}
          status={capture.status}
          heard={capture.heard}
          capturing={current.phase === "capturing" && !reducedMotion}
        />

        <div
          className="overflow-hidden rounded-md border border-[#1c2637]"
          style={{ height: LIST_HEIGHT }}
        >
          {/* Keyed on the loop, so starting the day over is a fade rather than four
              rows changing their contents in a single frame. */}
          <div
            key={Math.floor(tick / TIMELINE.length)}
            className="animate-fade-in space-y-px"
          >
            {entries.map((row, index) => (
              <EntryRow
                key={row.key}
                row={row}
                // Only the entries the demo records animate in. The opening four are the
                // state of the day before it starts and have always been there.
                arriving={index === 0 && landed > 0}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-md bg-[#1a1410] px-4 py-3">
          <span className="text-xs text-[#c9a877]">
            {onAccount ? "2 supplier bills unpaid" : "1 supplier bill unpaid"}
          </span>
          <span className="text-sm font-medium text-[#e9b45c] tabular-nums">
            {formatAmount(onAccount ? 12180 : 9780)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Fixed height in both states. A strip that grows when it starts listening would shove
 * the ledger down the card every few seconds, which is the exact fault this app spends
 * its layout rules avoiding.
 */
function CaptureStrip({
  icon: Icon,
  status,
  heard,
  capturing,
}: {
  icon: () => React.ReactElement;
  status: string;
  heard: string;
  capturing: boolean;
}) {
  return (
    <div
      className={`mt-5 mb-4 flex h-16 items-center gap-3 rounded-md border px-4
        transition-colors duration-500 ${
          capturing
            ? "border-[#3a2f1c] bg-[#171208]"
            : "border-[#1c2637] bg-[#0e1524]"
        }`}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center">
        {capturing && (
          <>
            <span className="pulse-ring absolute inset-0 rounded-full bg-[#e9b45c]/25" />
            <span className="pulse-ring pulse-ring-late absolute inset-0 rounded-full bg-[#e9b45c]/25" />
          </>
        )}
        <span
          className={`relative flex size-9 items-center justify-center rounded-full
            transition-colors duration-500 ${
              capturing
                ? "bg-[#e9b45c] text-nyx"
                : "bg-[#16203180] text-[#6f8098]"
            }`}
        >
          <Icon />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-xs tracking-[0.14em] uppercase transition-colors
            duration-500 ${capturing ? "text-[#c9a877]" : "text-[#5b6b81]"}`}
        >
          {capturing ? status : "Saved to today"}
        </span>
        <span
          className={`mt-0.5 block truncate text-sm transition-colors duration-500 ${
            capturing ? "text-[#e4eaf3]" : "text-[#6f8098]"
          }`}
        >
          {heard}
        </span>
      </span>
    </div>
  );
}

function EntryRow({ row, arriving }: { row: DemoRow; arriving: boolean }) {
  return (
    <div className={arriving ? "entry-land" : undefined}>
      <div
        className="relative flex items-center gap-3 bg-[#0e1524] px-4"
        style={{ height: ROW_HEIGHT }}
      >
        {arriving && (
          <span
            className="land-flash pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(233,180,92,0.16), rgba(233,180,92,0) 62%)",
            }}
          />
        )}
        <span
          className={`h-8 w-[2px] shrink-0 rounded-full ${
            row.up ? "bg-[#3f9576]" : "bg-[#a8524b]"
          }`}
        />
        <div className="relative min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#e4eaf3]">
            {row.name}
          </p>
          <p className="truncate text-xs text-[#6f8098]">{row.note}</p>
        </div>
        <span
          className={`relative shrink-0 text-sm font-medium tabular-nums ${
            row.up ? "text-[#5f9f86]" : "text-[#c47a73]"
          }`}
        >
          {row.up ? "+" : "\u2212"}
          {row.amount.toLocaleString("en-LK")}
        </span>
      </div>
    </div>
  );
}

const WAYS = [
  {
    icon: MicIcon,
    title: "Say it",
    body: "Hold the button and speak, in Sinhala or English. It comes back as a filled-in entry you check and save.",
  },
  {
    icon: CameraIcon,
    title: "Photograph it",
    body: "Point the camera at a supplier invoice or a utility bill. The amount, the payee and the due date are read off it.",
  },
  {
    icon: KeyboardIcon,
    title: "Type it",
    body: "Amount, category, done: three taps at the counter. The fastest path is always still there.",
  },
];

function Ways() {
  return (
    <section className="py-20 lg:py-24">
      <div className={BAND}>
        <Reveal>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Three ways in. Use whichever the moment allows.
          </h2>
        </Reveal>
        <Reveal index={1}>
          <p className="mt-3 max-w-2xl text-mute">
            A queue at the counter and a delivery arriving are not the same
            moment, and they should not need the same amount of attention.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {WAYS.map(({ icon: Icon, title, body }, index) => (
            <Reveal key={title} index={index + 2}>
              <div className="lift group h-full rounded-lg border border-line bg-card p-6 2xl:p-8">
                <span
                  className="flex size-11 items-center justify-center rounded-md
                    bg-accent-wash text-accent transition-colors duration-300
                    group-hover:bg-accent-fill group-hover:text-nyx"
                >
                  <Icon />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                {/* A third of an uncapped band is a card wide enough to run these two
                    sentences to a hundred characters. The card may have the width; the
                    sentence may not. */}
                <p className="mt-2 max-w-md text-sm leading-relaxed text-mute">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    title: "Costs, not just takings",
    body: "Stock, utilities, rent, wages and transport are each their own line, so a bad month can be explained rather than just noticed.",
  },
  {
    title: "Credit purchases tracked",
    body: "Buy from a supplier on account and it stays on an unpaid list with its due date until you mark it settled.",
  },
  {
    title: "A report you can hand over",
    body: "One tap produces a PDF with the totals, a daily chart and what is still owed, for an accountant, a landlord or a loan officer.",
  },
  {
    title: "Corrections without deletions",
    body: "Edit a wrong amount, void an entry made twice. Nothing vanishes from the record, which is what makes it a book rather than a notepad.",
  },
];

function Capabilities() {
  return (
    <section className="border-y border-line bg-card py-20 lg:py-24">
      <div className={BAND}>
        <Reveal>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Enough of a book to be worth keeping.
          </h2>
        </Reveal>

        {/* Four across once there is room, rather than two columns of 700px lines. The
            extra width should buy more on screen at once, not longer sentences. */}
        <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 xl:grid-cols-4">
          {CAPABILITIES.map(({ title, body }, index) => (
            <Reveal key={title} index={index + 1}>
              <div className="group">
                {/* A rule with a gold tick that runs the width of the column on hover.
                    The section is prose, so the only thing to make responsive is the
                    prose itself. */}
                <span aria-hidden="true" className="block h-px w-full bg-line">
                  <span
                    className="bg-accent-fill block h-px w-10 transition-[width]
                      duration-500 ease-out group-hover:w-full"
                  />
                </span>
                <h3 className="eyebrow mt-5 block text-ink">{title}</h3>
                <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-mute">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const INCLUDED = [
  "Unlimited entries, categories and reports",
  "Voice and photo capture",
  "PDF cashflow reports",
  "Outstanding bills and due dates",
  "Every device the shop uses",
];

function Pricing() {
  return (
    <section className="relative overflow-hidden px-6 py-20 lg:py-24">
      {/* A single warm pool behind the one card asking for money, so the section reads
          as the destination rather than another band of text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[36rem]"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(233,180,92,0.13), transparent 70%)",
        }}
      />

      <div className="relative">
        <Reveal>
          <div className="mx-auto max-w-lg text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              One price, one shop.
            </h2>
            <p className="mt-3 text-mute">
              No tiers to compare and no per-user maths. Try it for{" "}
              {BILLING.trialDays} days first.
            </p>
          </div>
        </Reveal>

        <Reveal index={1}>
          <div className="aura-gold mx-auto mt-10 max-w-lg rounded-xl bg-card p-7 sm:p-9">
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-display text-5xl tracking-tight">
                {BILLING.price}
              </span>
            </div>
            <p className="mt-2 text-center text-sm text-mute">
              {BILLING.cadence}
            </p>

            <ul className="mt-7 flex flex-col gap-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/register"
              className="sheen mt-8 flex min-h-12 items-center justify-center rounded-md
                bg-accent-fill px-6 font-medium text-nyx transition-colors
                hover:bg-accent-fill-hover"
            >
              Start your {BILLING.trialDays} free days
            </Link>

            {/* The promise that decides whether a shop is willing to put its accounts in
                here at all, so it goes next to the price rather than in the terms. */}
            <p className="mt-5 border-t border-line pt-5 text-center text-xs leading-relaxed text-mute">
              If you stop paying, you keep your records. Reading, searching and
              exporting go on working. Only recording new entries stops.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The page opens on nyx and closes on it. Someone who has read this far has already been
 * past the one button at the top, and asking again at the end costs them nothing.
 */
function Closing() {
  return (
    <section className="relative overflow-hidden bg-nyx py-20 lg:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="ruled-nyx absolute inset-0" />
        <div
          className="drift-far absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(233,180,92,0.16) 0%, rgba(233,180,92,0) 65%)",
          }}
        />
      </div>

      <div className={`${BAND} relative text-center`}>
        <Reveal>
          <h2
            className="font-display mx-auto max-w-2xl text-3xl leading-tight
              tracking-tight text-balance text-[#f2f5fa] sm:text-4xl"
          >
            Tomorrow&rsquo;s trading could already be in a book.
          </h2>
        </Reveal>
        <Reveal index={1}>
          <p className="mx-auto mt-4 max-w-md text-balance text-[#a9b8ce]">
            Set the shop up in about a minute, then record the next sale as it
            happens.
          </p>
        </Reveal>
        <Reveal index={2}>
          <Link
            to="/register"
            className="sheen mx-auto mt-8 flex min-h-12 w-full max-w-xs items-center
              justify-center rounded-md bg-accent-fill px-7 font-medium text-nyx
              transition-colors hover:bg-accent-fill-hover"
          >
            Start your {BILLING.trialDays} free days
          </Link>
        </Reveal>
        <Reveal index={3}>
          <p className="mt-4 text-sm text-[#7a8faf]">
            No card. Cancel by doing nothing.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <div
        className={`${BAND} flex flex-col gap-4 text-sm text-mute sm:flex-row
          sm:items-center sm:justify-between`}
      >
        <span className="font-display text-base tracking-tight text-ink">
          Glaux Ledger
        </span>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/privacy" className="link-sweep hover:text-ink">
            Privacy
          </Link>
          <Link to="/terms" className="link-sweep hover:text-ink">
            Terms
          </Link>
          <a
            href={`mailto:${BILLING.supportEmail}`}
            className="link-sweep hover:text-ink"
          >
            {BILLING.supportEmail}
          </a>
        </nav>
      </div>
    </footer>
  );
}

function MicIcon() {
  return (
    <Glyph>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Glyph>
  );
}

function CameraIcon() {
  return (
    <Glyph>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.3-2h6.9l1.3 2h2.8A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </Glyph>
  );
}

function KeyboardIcon() {
  return (
    <Glyph>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
    </Glyph>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-accent"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
