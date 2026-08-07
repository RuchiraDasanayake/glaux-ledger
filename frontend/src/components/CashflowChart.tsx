import { useMemo, useState } from "react";
import { Money } from "@/components/Money";
import { formatAmount, formatPlainDay } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

/**
 * Money in above the line, money out below it, one column per day.
 *
 * Diverging rather than the PDF's side-by-side pairs: at phone width a fortnight of
 * paired bars is 28 slivers two pixels wide, and the shape that matters, whether the
 * shop is above water, is exactly the one that disappears. Split about a centre line
 * it survives at any width, and each day still gets its own column so a quiet Sunday
 * reads as quiet rather than as absent.
 *
 * Built from divs, not SVG. Percentage heights reflow with the container for free, and
 * the labels stay at the browser's own text rendering instead of being scaled by a
 * viewBox.
 */
export function CashflowChart({
  points,
  currency,
  loading = false,
}: {
  points: DailyPoint[];
  currency: string;
  loading?: boolean;
}) {
  // Which column the pointer is on. At rest it is today: the rightmost column, which
  // reads as "you are here", and the one day a shopkeeper glancing at this actually
  // wants the figures for.
  const [active, setActive] = useState<number | null>(null);

  const { peak, totals } = useMemo(() => summarise(points), [points]);
  const shown = active ?? points.length - 1;
  const point = peak === 0 ? null : (points[shown] ?? null);

  if (loading) return <ChartSkeleton />;

  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow eyebrow-dot">Last {points.length} days</h2>
        {/* Height reserved whether or not a day is under the pointer, so tracking
            across the chart never nudges the bars underneath. */}
        <p className="flex min-h-5 flex-wrap items-baseline gap-x-3 text-sm">
          {point && (
            <>
              <span className="font-medium">
                {formatPlainDay(point.day, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <Money
                value={point.income}
                currency={currency}
                type="income"
                size="small"
                signed
              />
              <Money
                value={point.expense}
                currency={currency}
                type="expense"
                size="small"
                signed
              />
            </>
          )}
        </p>
      </div>

      {peak === 0 ? (
        <p className="mt-6 mb-2 text-center text-sm text-mute">
          Nothing recorded in the last {points.length} days. Entries show up
          here as you make them.
        </p>
      ) : (
        <>
          {/* One role="img" for the whole chart rather than a labelled element per bar:
              thirty announced columns is not a summary, it is a recital. The figures
              themselves stay reachable in the table below. */}
          <div
            role="img"
            aria-label={`Daily money in and out for the last ${points.length} days`}
            className="relative mt-4 flex h-40 items-stretch gap-px md:h-48 lg:h-56"
            onPointerLeave={() => setActive(null)}
          >
            {/* The zero line, drawn once behind the columns rather than as a border on
                each, so it stays a single unbroken rule. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-line"
            />
            {points.map((day, index) => (
              <Column
                key={day.day}
                day={day}
                peak={peak}
                today={index === points.length - 1}
                active={index === shown}
                onEnter={() => setActive(index)}
              />
            ))}
          </div>

          <DataTable points={points} currency={currency} />

          <div className="mt-2 flex justify-between text-xs text-mute">
            <span>{formatPlainDay(points[0].day)}</span>
            <span>Today</span>
          </div>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
            <div className="flex items-baseline gap-2">
              <dt className="text-mute">In</dt>
              <dd>
                <Money
                  value={totals.income}
                  currency={currency}
                  type="income"
                  signed
                />
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-mute">Out</dt>
              <dd>
                <Money
                  value={totals.expense}
                  currency={currency}
                  type="expense"
                  signed
                />
              </dd>
            </div>
            <div className="ml-auto flex items-baseline gap-2">
              <dt className="text-mute">Net</dt>
              <dd>
                <Money
                  value={totals.income - totals.expense}
                  currency={currency}
                  className="font-semibold"
                />
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

/**
 * One day. Two halves of a fixed-height row, so the zero line sits still no matter how
 * lopsided the day was; scaling each half independently would let a big expense day
 * push the axis around and make neighbouring days incomparable.
 */
function Column({
  day,
  peak,
  today,
  active,
  onEnter,
}: {
  day: DailyPoint;
  peak: number;
  today: boolean;
  active: boolean;
  onEnter: () => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative flex min-w-0 flex-1 flex-col"
      onPointerEnter={onEnter}
      // A day with nothing on it still has to be pointable, or the readout skips the
      // quiet days that are themselves worth noticing.
      onPointerDown={onEnter}
    >
      <div
        className={`absolute inset-0 rounded-sm transition-colors duration-[var(--dur-fast)]
          ${active ? "bg-ink/[0.05]" : ""}`}
      />

      <div className="relative flex h-1/2 items-end pb-px">
        <Bar
          height={share(Number(day.income), peak)}
          tone="bg-income"
          today={today}
        />
      </div>
      <div className="relative flex h-1/2 items-start pt-px">
        <Bar
          height={share(Number(day.expense), peak)}
          tone="bg-expense"
          today={today}
        />
      </div>
    </div>
  );
}

/**
 * The same numbers as a table, for screen readers and for anyone who wants the figure
 * rather than the shape. Hidden visually because the chart above already says it.
 */
function DataTable({
  points,
  currency,
}: {
  points: DailyPoint[];
  currency: string;
}) {
  return (
    <table className="sr-only">
      <caption>Money in and out per day</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">In</th>
          <th scope="col">Out</th>
        </tr>
      </thead>
      <tbody>
        {points.map((day) => (
          <tr key={day.day}>
            <th scope="row">
              {formatPlainDay(day.day, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </th>
            <td>{formatAmount(day.income, currency)}</td>
            <td>{formatAmount(day.expense, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bar({
  height,
  tone,
  today,
}: {
  height: number;
  tone: string;
  today: boolean;
}) {
  if (height === 0) return null;
  return (
    <div
      className={`w-full rounded-[1px] transition-[height] duration-[var(--dur-slow)]
        ease-[var(--ease-out)] ${tone} ${today ? "" : "opacity-80"}`}
      style={{ height: `${height}%` }}
    />
  );
}

/** Floored at 2% so a real but tiny day is a mark rather than nothing at all. */
function share(value: number, peak: number): number {
  if (value <= 0) return 0;
  return Math.max((value / peak) * 100, 2);
}

/**
 * One scale for both halves, taken from the largest single day in either direction.
 *
 * Scaling each half to its own maximum would fit more detail on screen and lie about
 * the only thing the chart is for: a month where the red is twice the green has to
 * look like one.
 */
function summarise(points: DailyPoint[]) {
  let peak = 0;
  let income = 0;
  let expense = 0;

  for (const day of points) {
    const dayIn = Number(day.income);
    const dayOut = Number(day.expense);
    income += dayIn;
    expense += dayOut;
    peak = Math.max(peak, dayIn, dayOut);
  }

  return { peak, totals: { income, expense } };
}

function ChartSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="rounded-lg border border-line bg-card p-5"
    >
      <div className="skeleton h-3 w-28" />
      <div className="mt-4 flex h-40 items-center gap-px md:h-48 lg:h-56">
        {Array.from({ length: 30 }, (_, index) => (
          <div
            key={index}
            className="flex h-full flex-1 flex-col justify-center"
          >
            <div
              className="skeleton w-full rounded-[1px]"
              style={{ height: `${18 + ((index * 37) % 55)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="skeleton mt-6 h-3 w-full" />
    </section>
  );
}
