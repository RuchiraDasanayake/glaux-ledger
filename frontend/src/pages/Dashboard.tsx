import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CashflowChart } from "@/components/CashflowChart";
import { Money } from "@/components/Money";
import { Page } from "@/components/Page";
import { Reveal } from "@/components/Reveal";
import { useDailySeries, useSummary } from "@/hooks/useLedger";
import { useBusiness } from "@/lib/auth-context";
import { formatAmount, formatDateRange } from "@/lib/format";
import type { CategoryBreakdown, Period, Summary } from "@/lib/types";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "day", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const PREVIOUS_LABEL: Record<Period, string> = {
  day: "yesterday",
  week: "last week",
  month: "last month",
};

// A month of trading, fixed rather than following the period tabs above it. Those
// answer "how much today"; the chart answers "how has the shop been", and that is not
// a different question depending on which tab is lit.
const TREND_DAYS = 30;

export function Dashboard() {
  const business = useBusiness();
  // Day, not month: the question being asked is almost always "how did today go".
  const [period, setPeriod] = useState<Period>("day");
  const { data: summary, isLoading, isPlaceholderData } = useSummary(period);
  const { data: trend, isLoading: loadingTrend } = useDailySeries(TREND_DAYS);

  const income = Number(summary?.income ?? 0);
  const expense = Number(summary?.expense ?? 0);

  // Split rather than one list sorted by amount. Mixed together, a Rs 15,000 rent sits
  // directly above a Rs 1,250 sale and the eye reads them as comparable when they are
  // opposites, and the bars, scaled to a single maximum, made every sale look trivial.
  const { earned, spent, largestIncome, largestExpense } = useMemo(
    () => splitByDirection(summary),
    [summary],
  );

  return (
    // The phone gets its bearings from the tab bar and has no room to spare, so the
    // heading is announced but not drawn. With a rail there is both room and a reason:
    // History and Export are titled, and this would be the one screen that is not.
    <Page
      title="Dashboard"
      titleVisibility="md-up"
      actions={
        // Full width on a phone, where it is the only thing in the row. On a desktop a
        // three-item control stretched across a 900px column would be absurd, so it
        // shrinks to its content and sits beside the heading.
        <div
          role="tablist"
          aria-label="Time period"
          className="flex w-full gap-1 rounded-md border border-line bg-card p-1 md:w-auto"
        >
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              role="tab"
              aria-selected={period === value}
              onClick={() => setPeriod(value)}
              className={`min-h-10 flex-1 rounded-sm text-sm font-medium transition-colors
                md:flex-none md:px-6
                ${period === value ? "bg-accent-fill text-nyx" : "text-mute hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {/* Two bands rather than two columns. A tall left column of summary beside a tall
        right column of detail leaves whichever is shorter as a hole; on a 1440px
        screen that was a third of the page. The figures band and the breakdown band
        each fill their own width, and the stacking order on a phone is unchanged. */}
      <div className="flex flex-col gap-6 lg:gap-8">
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8">
          {/* Switching period keeps the outgoing figures on screen and fades them while
            the new ones load, rather than blanking to a skeleton. The numbers never
            move, and a dimmed figure is honestly labelled as the one being replaced.

            Applied to the period-dependent blocks rather than the whole page: the trend
            chart spans a fixed thirty days and has no business flickering because
            someone tapped Week. */}
          <div
            aria-busy={isPlaceholderData}
            className={`flex flex-col gap-4 transition-opacity duration-[var(--dur-base)]
            ${isPlaceholderData ? "opacity-45" : ""}`}
          >
            <section className="rounded-lg border border-line bg-card px-5 py-6 text-center lg:py-8">
              <h2 className="eyebrow">Net</h2>
              <Money
                value={summary?.net ?? 0}
                currency={business.currency}
                size="hero"
                animate
                className="mt-2 block"
              />
              {/* Reserved, not conditional. These two lines arrive a beat after the net
                figure does, and with nothing holding their space the card and every
                thing under it lurched as they landed. */}
              <div className="mt-1 min-h-10">
                {summary && (
                  <>
                    <p className="text-xs text-mute">
                      {formatDateRange(summary.start_date, summary.end_date)}
                    </p>
                    <Trend
                      net={Number(summary.net)}
                      previous={Number(summary.previous_net)}
                      currency={business.currency}
                      label={PREVIOUS_LABEL[period] ?? "the period before"}
                    />
                  </>
                )}
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5">
                <div>
                  <dt className="eyebrow">In</dt>
                  <dd className="mt-1">
                    <Money
                      value={income}
                      currency={business.currency}
                      type="income"
                      size="total"
                      signed
                    />
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Out</dt>
                  <dd className="mt-1">
                    <Money
                      value={expense}
                      currency={business.currency}
                      type="expense"
                      size="total"
                      signed
                    />
                  </dd>
                </div>
              </dl>
            </section>

            {summary && (
              <OutstandingStrip
                summary={summary}
                currency={business.currency}
              />
            )}
          </div>

          <CashflowChart
            points={trend?.points ?? []}
            currency={business.currency}
            loading={loadingTrend}
          />
        </div>

        <div
          aria-busy={isPlaceholderData}
          className={`grid gap-7 transition-opacity duration-[var(--dur-base)]
          lg:grid-cols-2 lg:gap-8 ${isPlaceholderData ? "opacity-45" : ""}`}
        >
          {isLoading && <BreakdownSkeleton />}

          {!isLoading && earned.length === 0 && spent.length === 0 && (
            <p className="rounded-md border border-line bg-card px-4 py-6 text-center text-sm text-mute lg:col-span-2">
              No entries in this period yet.
            </p>
          )}

          <Breakdown
            title="Money in"
            rows={earned}
            largest={largestIncome}
            currency={business.currency}
          />
          <Breakdown
            title="Money out"
            rows={spent}
            largest={largestExpense}
            currency={business.currency}
          />
        </div>
      </div>
    </Page>
  );
}

function splitByDirection(summary: Summary | undefined) {
  const rows = summary?.by_category ?? [];
  const earned = rows.filter((row) => row.entry_type === "income");
  const spent = rows.filter((row) => row.entry_type === "expense");
  const peak = (group: CategoryBreakdown[]) =>
    Math.max(...group.map((row) => Number(row.total)), 1);

  // Each side scales to its own largest bar. Sharing one maximum across both meant a
  // single month's rent flattened every sale to a sliver.
  return {
    earned,
    spent,
    largestIncome: peak(earned),
    largestExpense: peak(spent),
  };
}

/**
 * A net figure alone says nothing about direction of travel. Rs 4,000 is a good day or
 * a bad one depending entirely on what the previous one did.
 *
 * The comparison is in money, not percent. A shop's daily net swings through zero all
 * the time: one month's rent against a quiet Tuesday produces "1256% down", which is
 * arithmetically correct and tells the owner nothing. "Rs 15,700 less than yesterday"
 * is the same fact in the unit they actually think in.
 */
function Trend({
  net,
  previous,
  currency,
  label,
}: {
  net: number;
  previous: number;
  currency: string;
  label: string;
}) {
  const delta = net - previous;

  if (previous === 0 && net === 0) {
    return (
      <p className="mt-2 text-xs text-mute">
        Nothing recorded {label} to compare against.
      </p>
    );
  }

  if (Math.abs(delta) < 0.01) {
    return <p className="mt-2 text-xs text-mute">Level with {label}.</p>;
  }

  const up = delta > 0;

  return (
    <p
      className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium
        ${up ? "text-income" : "text-expense"}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={up ? "" : "rotate-180"}
      >
        <path d="M12 19V6M5 12l7-7 7 7" />
      </svg>
      {formatAmount(Math.abs(delta), currency)} {up ? "more" : "less"} than{" "}
      {label}
    </p>
  );
}

/**
 * What the shop still owes, and how much of it is late.
 *
 * Unlike everything above it this ignores the selected period, because a bill from two
 * months ago is still owed today. Hidden entirely when there is nothing outstanding --
 * a permanent "Rs 0 owed" panel is furniture, not information.
 */
function OutstandingStrip({
  summary,
  currency,
}: {
  summary: Summary;
  currency: string;
}) {
  const payable = Number(summary.outstanding_payable);
  const receivable = Number(summary.outstanding_receivable);
  if (payable <= 0 && receivable <= 0) return null;

  const overdue = summary.overdue_count;

  return (
    <Link
      to="/history?settled=false"
      className={`lift mt-4 block rounded-lg border px-5 py-4 ${
        overdue > 0
          ? "border-expense/30 bg-expense-wash"
          : "border-line bg-card"
      }`}
    >
      <span className="eyebrow eyebrow-dot">You owe</span>
      <span className="mt-1.5 flex items-baseline justify-between gap-3">
        <Money value={payable} currency={currency} size="total" />
        <span className="text-sm font-medium text-mute">
          {overdue > 0 ? (
            <span className="text-expense">{overdue} overdue</span>
          ) : (
            "View"
          )}
        </span>
      </span>
      {receivable > 0 && (
        <span className="mt-2 block text-sm text-mute">
          Owed to you:{" "}
          <Money value={receivable} currency={currency} size="small" />
        </span>
      )}
    </Link>
  );
}

function Breakdown({
  title,
  rows,
  largest,
  currency,
}: {
  title: string;
  rows: CategoryBreakdown[];
  largest: number;
  currency: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="eyebrow eyebrow-dot mb-3">{title}</h2>
      <ul className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <CategoryBar
            key={`${row.category_id}-${row.entry_type}`}
            row={row}
            index={index}
            largest={largest}
            currency={currency}
          />
        ))}
      </ul>
    </section>
  );
}

function BreakdownSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="skeleton mb-3 h-3 w-24" />
      <ul className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((row) => (
          <li key={row}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <div className="skeleton h-3.5 w-32" />
              <div className="skeleton h-3.5 w-20" />
            </div>
            <div className="skeleton h-2 w-full rounded-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Bars rather than a pie: slices are hard to compare and impossible to label at phone
 * width, and amounts right-aligned in tabular figures read as a scannable column.
 */
function CategoryBar({
  row,
  index,
  largest,
  currency,
}: {
  row: CategoryBreakdown;
  index: number;
  largest: number;
  currency: string;
}) {
  const total = Number(row.total);
  const share = Math.max((total / largest) * 100, 2);
  const tone = row.entry_type === "income" ? "bg-income" : "bg-expense";

  return (
    <Reveal as="li" index={index}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate font-medium">{row.category_name}</span>
        <Money
          value={total}
          currency={currency}
          type={row.entry_type}
          className="shrink-0"
        />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-[var(--dur-slow)]
            ease-[var(--ease-out)] ${tone}`}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-mute">
        {row.count} {row.count === 1 ? "entry" : "entries"}
      </p>
    </Reveal>
  );
}
