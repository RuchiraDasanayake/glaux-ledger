import { useState } from "react";
import { Button } from "@/components/Button";
import { Money } from "@/components/Money";
import { Page } from "@/components/Page";
import { useRangeSummary } from "@/hooks/useLedger";
import { useBusiness } from "@/lib/auth-context";
import { downloadFile } from "@/lib/api";
import { formatDateRange, todayInZone } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import type { CategoryBreakdown, Summary } from "@/lib/types";

type Preset = "week" | "month" | "quarter" | "custom";

// "Last 7 days" under a heading reading Period says "last" twice. Dropping it is not only
// tidier: three of the longer label wrap onto a second line inside the form column, and a
// control that changes shape when the window does is the thing this layout is avoiding.
const PRESETS: Array<{ value: Preset; label: string; days: number }> = [
  { value: "week", label: "7 days", days: 6 },
  { value: "month", label: "30 days", days: 29 },
  { value: "quarter", label: "90 days", days: 89 },
];

export function Export() {
  const business = useBusiness();
  const today = todayInZone(business.timezone);
  const toast = useToast();

  const [preset, setPreset] = useState<Preset>("month");
  const [fromDate, setFromDate] = useState(() => shiftDays(today, -29));
  const [toDate, setToDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choosePreset(value: Preset, days: number) {
    setPreset(value);
    setFromDate(shiftDays(today, -days));
    setToDate(today);
  }

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(
        `/reports/export?from_date=${fromDate}&to_date=${toDate}`,
        `${business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${fromDate}-to-${toDate}.pdf`,
      );
      toast("Report downloaded.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not build that report.",
      );
    } finally {
      setBusy(false);
    }
  }

  const invalidRange = toDate < fromDate;
  const { data: preview, isPending: loadingPreview } = useRangeSummary(
    fromDate,
    toDate,
  );

  return (
    <Page title="Export">
      <p className="-mt-3 mb-5 max-w-prose text-sm text-mute">
        A PDF summary of income, expenses and the daily cashflow trend, with
        anything still owed listed at the end.
      </p>

      {/* The controls are a date range and a button, and neither improves with width. So
          the extra space on a large screen goes to the figures the report will contain
          rather than to a stretched form: a PDF is a slow and opaque way to find out the
          dates were wrong.

          Anchored left, not centred: the page's left edge has to be where every other
          tab's is, or changing tab slides the whole app sideways. */}
      {/* Side by side only from xl. Below it the second column would be narrower than the
          figures it holds, and a four-figure strip crushed into 280px is worse than the
          same strip full width underneath. */}
      <div
        className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]
          xl:items-start xl:gap-12 2xl:gap-16"
      >
        <div className="flex flex-col gap-5 rounded-md border border-line bg-card p-4 md:p-6">
          <div>
            <span className="mb-2 block text-sm font-medium">Period</span>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(({ value, label, days }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preset === value}
                  onClick={() => choosePreset(value, days)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors
                    ${
                      preset === value
                        ? "border-accent-edge bg-accent-fill text-nyx"
                        : "border-line bg-card text-ink"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <DateField
              label="From"
              value={fromDate}
              max={toDate}
              onChange={(value) => {
                setFromDate(value);
                setPreset("custom");
              }}
            />
            <DateField
              label="To"
              value={toDate}
              max={today}
              onChange={(value) => {
                setToDate(value);
                setPreset("custom");
              }}
            />
          </div>

          {invalidRange && (
            <p role="alert" className="text-sm text-expense">
              The end date is before the start date.
            </p>
          )}

          <Button
            onClick={onDownload}
            loading={busy}
            disabled={invalidRange}
            type="button"
          >
            Download PDF
          </Button>

          {error && (
            <p
              role="alert"
              className="bg-expense-wash rounded-sm px-3 py-2 text-sm text-expense"
            >
              {error}
            </p>
          )}
        </div>

        <Preview
          summary={invalidRange ? undefined : preview}
          loading={loadingPreview && !invalidRange}
          currency={business.currency}
        />
      </div>

      <section className="mt-10 lg:mt-12">
        <h2 className="eyebrow eyebrow-dot mb-3">What is in it</h2>
        <ul className="grid gap-2.5 text-sm text-mute sm:grid-cols-2 xl:grid-cols-3">
          {CONTENTS.map((item) => (
            <li key={item} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-2 size-1 shrink-0 rounded-full bg-accent-edge"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}

/**
 * The report's own figures, for the range currently selected.
 *
 * Not a rehash of the dashboard: the dashboard answers named periods and this answers the
 * exact span about to be printed, which is the only question worth asking with a download
 * button next to it.
 */
function Preview({
  summary,
  loading,
  currency,
}: {
  summary: Summary | undefined;
  loading: boolean;
  currency: string;
}) {
  if (loading) return <PreviewSkeleton />;
  if (!summary) return null;

  const rows = [...summary.by_category].sort(
    (a, b) => Number(b.total) - Number(a.total),
  );
  // Split by direction rather than left as one list. Unsplit, the list wrapped into
  // columns that meant nothing, and directly under an In | Out band, next to a dashboard
  // that puts money in on the left, a wrapped expense read as an expense filed under
  // income. The columns now say what they looked like they were saying all along.
  const earned = rows.filter((row) => row.entry_type === "income");
  const spent = rows.filter((row) => row.entry_type !== "income");
  const empty = rows.length === 0;

  return (
    <section aria-live="polite">
      <h2 className="eyebrow eyebrow-dot mb-3">
        In this report · {formatDateRange(summary.start_date, summary.end_date)}
      </h2>

      {/* Two up until there is genuinely room for four. Between xl and 2xl this sits in a
          ~536px column, where a five-figure amount at this size runs past its cell. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line 2xl:grid-cols-4">
        <Figure label="In" className="bg-card">
          <Money
            value={summary.income}
            currency={currency}
            type="income"
            size="total"
          />
        </Figure>
        <Figure label="Out" className="bg-card">
          <Money
            value={summary.expense}
            currency={currency}
            type="expense"
            size="total"
          />
        </Figure>
        <Figure label="Net" className="bg-card">
          <Money value={summary.net} currency={currency} size="total" />
        </Figure>
        <Figure label="Still owed" className="bg-card">
          <Money
            value={summary.outstanding_payable}
            currency={currency}
            size="total"
          />
          {summary.overdue_count > 0 && (
            <span className="mt-1 block text-xs text-expense">
              {summary.overdue_count} overdue
            </span>
          )}
        </Figure>
      </dl>

      {empty ? (
        <p className="mt-4 rounded-md border border-line bg-card px-4 py-6 text-center text-sm text-mute">
          Nothing was recorded in this range. The report would come out empty.
        </p>
      ) : (
        <div className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          <CategoryGroup title="Money in" rows={earned} currency={currency} />
          <CategoryGroup title="Money out" rows={spent} currency={currency} />
        </div>
      )}
    </section>
  );
}

/** The same heading and the same order as the dashboard's breakdown, largest first. */
function CategoryGroup({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: CategoryBreakdown[];
  currency: string;
}) {
  return (
    <section>
      <h3 className="eyebrow eyebrow-dot mb-3">{title}</h3>
      {rows.length === 0 ? (
        // Kept rather than dropped when a side is empty. A period with no costs at all
        // is worth noticing, and a heading that vanishes takes the fact with it.
        <p className="text-sm text-mute">Nothing in this period.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <CategoryLine key={row.category_id} row={row} currency={currency} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`px-4 py-4 ${className}`}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function CategoryLine({
  row,
  currency,
}: {
  row: CategoryBreakdown;
  currency: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <span className="min-w-0 truncate text-sm">{row.category_name}</span>
      <Money
        value={row.total}
        currency={currency}
        type={row.entry_type}
        size="small"
        className="shrink-0"
      />
    </li>
  );
}

function PreviewSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="skeleton mb-3 h-3 w-48" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((cell) => (
          <div key={cell} className="bg-card px-4 py-4">
            <div className="skeleton h-3 w-10" />
            <div className="skeleton mt-2.5 h-7 w-24" />
          </div>
        ))}
      </div>
      {/* The same two groups the real preview has, so the figures landing does not
          reshuffle the page under whoever is reading it. */}
      <div className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
        {[0, 1].map((group) => (
          <div key={group}>
            <div className="skeleton mb-3 h-3 w-24" />
            <ul className="flex flex-col gap-3">
              {[0, 1, 2].map((row) => (
                <li
                  key={row}
                  className="flex justify-between border-b border-line pb-2"
                >
                  <div className="skeleton h-3.5 w-28" />
                  <div className="skeleton h-3.5 w-14" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// Worth spelling out. This is the artefact the shop hands to an accountant or a bank,
// and nobody downloads a PDF twice to find out whether it has what they need.
const CONTENTS = [
  "Income and expenses for the period, and the net between them",
  "A breakdown by category, money in and money out kept apart",
  "A daily cashflow chart across the whole range",
  "Every bill still unpaid, with its due date, including ones from before the period",
  "Your shop name, the date range, and the currency on every figure",
];

function DateField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const id = `export-${label.toLowerCase()}`;
  return (
    // min-w-0: a native date input's intrinsic width exceeds a flex basis at phone
    // width, so without it the second field pushes out of the card.
    <div className="min-w-0 flex-1">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-mute"
      >
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-sm border border-line bg-card px-3 focus:border-accent"
      />
    </div>
  );
}

/** Date maths on the YYYY-MM-DD string, to avoid a UTC round trip shifting the day. */
function shiftDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}
