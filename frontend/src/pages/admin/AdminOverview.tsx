import { Link } from "react-router-dom";
import { useAdminOverview } from "@/hooks/useAdminShops";
import { delay } from "@/lib/motion";

export function AdminOverview() {
  const { data, isPending, isError, refetch } = useAdminOverview();

  return (
    <div>
      <header style={delay(40)} className="rise mb-8">
        <p className="eyebrow eyebrow-dot">Operations</p>
        <h1 className="font-display mt-2 text-3xl tracking-tight">Overview</h1>
        <p className="mt-2 max-w-xl text-mute">
          A quiet read of the ledger business: who&apos;s on trial, who&apos;s
          paying, and what needs a human today.
        </p>
      </header>

      {isPending && (
        <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="skeleton h-28 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-md border border-line bg-card px-4 py-4 text-sm"
        >
          <p className="text-mute">Could not load the overview.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 font-medium text-accent underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div
            style={delay(100)}
            className="rise grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Metric
              label="Shops"
              value={data.shops_total}
              hint={`${data.shops_joined_7d} joined this week`}
              to="/admin/shops"
            />
            <Metric
              label="On trial"
              value={data.shops_trialing}
              hint="Still inside the free window"
              to="/admin/shops?status=trialing"
              tone="accent"
            />
            <Metric
              label="Paying"
              value={data.shops_active}
              hint="Paid through today or later"
              to="/admin/shops?status=active"
              tone="income"
            />
            <Metric
              label="Lapsed"
              value={data.shops_lapsed}
              hint="Writes blocked until they renew"
              to="/admin/shops?status=lapsed"
              tone="expense"
            />
            <Metric
              label="Suspended"
              value={data.shops_suspended}
              hint="Paused by staff"
              to="/admin/shops?status=suspended"
              tone="mute"
            />
            <Metric
              label="Slips waiting"
              value={data.pending_payments}
              hint="Bank transfers to review"
              to="/admin/payments"
              tone={data.pending_payments > 0 ? "accent" : "mute"}
              pulse={data.pending_payments > 0}
            />
          </div>

          <section style={delay(180)} className="rise mt-10">
            <h2 className="font-display text-xl tracking-tight">Next moves</h2>
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
              <QuickLink
                to="/admin/payments"
                title="Review payment slips"
                body={
                  data.pending_payments === 0
                    ? "Queue is clear."
                    : `${data.pending_payments} pending — open the queue.`
                }
                urgent={data.pending_payments > 0}
              />
              <QuickLink
                to="/admin/shops?status=lapsed"
                title="Chase lapsed shops"
                body={
                  data.shops_lapsed === 0
                    ? "Nobody is locked out right now."
                    : `${data.shops_lapsed} shop${data.shops_lapsed === 1 ? "" : "s"} need a renewal.`
                }
                urgent={data.shops_lapsed > 0}
              />
              <QuickLink
                to="/admin/shops"
                title="Browse every shop"
                body="Search by name or owner email, extend paid time, or suspend."
              />
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  to,
  tone = "ink",
  pulse = false,
}: {
  label: string;
  value: number;
  hint: string;
  to: string;
  tone?: "ink" | "accent" | "income" | "expense" | "mute";
  pulse?: boolean;
}) {
  const valueClass =
    tone === "accent"
      ? "text-accent"
      : tone === "income"
        ? "text-income"
        : tone === "expense"
          ? "text-expense"
          : tone === "mute"
            ? "text-mute"
            : "text-ink";

  return (
    <Link
      to={to}
      className={`group block rounded-md border border-line bg-card px-5 py-5 transition-colors
        hover:border-accent-edge hover:bg-sunk focus-visible:border-accent ${
          pulse ? "ring-1 ring-accent/30" : ""
        }`}
    >
      <p className="text-xs font-medium tracking-wide text-mute uppercase">
        {label}
      </p>
      <p className={`font-display mt-3 text-4xl tracking-tight ${valueClass}`}>
        {value}
      </p>
      <p className="mt-2 text-sm text-mute group-hover:text-ink">{hint}</p>
    </Link>
  );
}

function QuickLink({
  to,
  title,
  body,
  urgent = false,
}: {
  to: string;
  title: string;
  body: string;
  urgent?: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-sunk
          focus-visible:bg-sunk sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
      >
        <span className="flex items-center gap-2 font-semibold text-ink">
          {title}
          {urgent && (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-accent"
            />
          )}
        </span>
        <span
          className={`text-sm sm:text-right ${urgent ? "text-ink" : "text-mute"}`}
        >
          {body}
        </span>
      </Link>
    </li>
  );
}
