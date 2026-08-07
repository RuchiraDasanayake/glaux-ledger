import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { Page } from "@/components/Page";
import { PaymentUploadSheet } from "@/components/PaymentUploadSheet";
import { RecurringSettings } from "@/components/RecurringSettings";
import { Reveal } from "@/components/Reveal";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from "@/hooks/useLedger";
import { usePaymentSubmissions } from "@/hooks/usePayments";
import { useAuth } from "@/lib/auth-context";
import { BILLING, formatDay, hasBankDetails } from "@/lib/billing";
import { formatAmount, formatPlainDay } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import type {
  Category,
  EntryType,
  PaymentSubmission,
  PaymentSubmissionStatus,
} from "@/lib/types";

export function Settings() {
  const { business, email, signOut } = useAuth();

  return (
    <Page title="Settings">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        {/* Billing above categories. It is read once and acted on, where the category
            list is browsed, and a shop that followed the banner here to find out how
            to pay should not have to scroll past ten categories to do it. */}
        <div className="flex min-w-0 flex-col gap-10">
          <BillingPanel />
          <RecurringSettings />
          <CategorySettings />
        </div>

        <section className="rounded-lg border border-line bg-card p-5 lg:sticky lg:top-8">
          <h2 className="eyebrow eyebrow-dot mb-4">Shop</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <Detail label="Name" value={business?.name ?? "-"} />
            <Detail label="Signed in as" value={email ?? "-"} />
            <Detail label="Currency" value={business?.currency ?? "-"} />
            <Detail label="Timezone" value={business?.timezone ?? "-"} />
          </dl>
          {/* Read-only for now, and said so rather than implied by absence. Currency and
              timezone in particular reinterpret every figure already recorded, so they
              are not a settings-screen toggle. */}
          <p className="mt-4 text-xs text-mute">
            These are fixed when the shop is created. Currency and timezone
            change the meaning of entries already recorded, so they are not
            editable here.
          </p>

          <hr className="rule my-5" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <button
              type="button"
              onClick={signOut}
              className="font-medium text-mute transition-colors hover:text-expense"
            >
              Sign out
            </button>
            <Link
              to="/privacy"
              className="text-mute transition-colors hover:text-ink"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-mute transition-colors hover:text-ink"
            >
              Terms
            </Link>
          </div>
        </section>
      </div>
    </Page>
  );
}

const PLAN_STATE = {
  trialing: { label: "Free trial", tone: "text-accent bg-accent-wash" },
  active: { label: "Active", tone: "text-income bg-income-wash" },
  lapsed: { label: "Ended", tone: "text-expense bg-expense-wash" },
} as const;

const SUBMISSION_STATUS: Record<
  PaymentSubmissionStatus,
  {
    label: string;
    tone: string;
    detail: (row: PaymentSubmission, paidThrough: string | null) => string;
  }
> = {
  pending: {
    label: "Under review",
    tone: "text-accent bg-accent-wash",
    detail: () => "Usually the same day. You can keep using the app meanwhile.",
  },
  approved: {
    label: "Payment applied",
    tone: "text-income bg-income-wash",
    detail: (_row, paidThrough) =>
      paidThrough
        ? `Paid through ${formatDay(paidThrough)}.`
        : "Your subscription has been extended.",
  },
  rejected: {
    label: "Needs attention",
    tone: "text-expense bg-expense-wash",
    detail: (row) =>
      row.review_note?.trim() ||
      "Something did not match. Submit again or email support.",
  },
};

function BillingPanel() {
  const { business, refresh } = useAuth();
  const { data: submissions = [], isPending, isError, refetch, isFetching } =
    usePaymentSubmissions();
  const [uploadOpen, setUploadOpen] = useState(false);

  // An approval applied by staff should lift the banner without a full reload.
  useEffect(() => {
    if (!submissions.some((row) => row.status === "approved")) return;
    void refresh().catch(() => {});
  }, [submissions, refresh]);

  if (!business) return null;

  const plan = PLAN_STATE[business.status];
  const renewalDay =
    business.status === "active" && business.paid_through
      ? formatDay(business.paid_through)
      : formatDay(business.trial_ends_at);

  return (
    // Linked to from the shell banner, so it has to be addressable and scroll into view.
    <section id="billing" className="scroll-mt-6">
      <h2 className="eyebrow eyebrow-dot mb-4">Billing</h2>

      <div className="rounded-md border border-line bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <span className="text-2xl font-semibold tracking-tight">
              {BILLING.price}
            </span>
            <span className="ml-2 text-sm text-mute">{BILLING.cadence}</span>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${plan.tone}`}
          >
            {plan.label}
          </span>
        </div>

        <p className="mt-3 text-sm text-mute">
          {business.status === "active"
            ? `Paid up to ${renewalDay}.`
            : business.status === "trialing"
              ? `Your trial runs to ${renewalDay}. No card needed until then.`
              : `Ended on ${renewalDay}.`}
        </p>

        <hr className="rule my-5" />

        {/* Stated plainly and in the same panel as the price, because it is the thing a
            shop owner most needs to know before handing over their books: the paywall
            never reaches the records themselves. */}
        <p className="text-sm">
          <span className="font-medium">Your records are always yours.</span>{" "}
          Reading, searching and exporting to PDF keep working whether or not
          the subscription is current. Only recording new entries stops.
        </p>

        <h3 className="mt-5 mb-3 text-sm font-semibold">How to pay</h3>
        <ol className="flex flex-col gap-4">
          <PayStep n={1} title="Copy the bank details">
            {hasBankDetails ? (
              <dl className="mt-2 flex flex-col gap-2 text-sm">
                <Detail label="Bank" value={BILLING.bankName} />
                <Detail label="Account name" value={BILLING.accountName} />
                <Detail label="Account number" value={BILLING.accountNumber} />
                <Detail label="Reference" value={business.name} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-mute">
                Email <PayLink business={business.name} /> and we will send the
                account details.
              </p>
            )}
          </PayStep>
          <PayStep n={2} title="Make the transfer">
            <p className="mt-2 text-sm text-mute">
              Send {BILLING.price} and use your shop name as the reference so we
              can match it. No card is taken and nothing recurs automatically.
            </p>
          </PayStep>
          <PayStep n={3} title="Submit the bank slip">
            <p className="mt-2 text-sm text-mute">
              Upload a JPEG, PNG, or PDF of the transfer. Staff review it by
              hand, usually the same day. This stays available if your
              subscription has ended.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                block={false}
                className="min-h-11 sm:w-auto"
                onClick={() => setUploadOpen(true)}
              >
                Upload payment proof
              </Button>
            </div>
          </PayStep>
        </ol>

        <p className="mt-4 text-xs text-mute">
          Questions about a transfer? Email{" "}
          <PayLink business={business.name} />.
        </p>
      </div>

      <PaymentHistory
        submissions={submissions}
        loading={isPending}
        errored={isError}
        refreshing={isFetching && !isPending}
        onRetry={() => void refetch()}
        currency={business.currency}
        paidThrough={business.paid_through}
      />

      <PaymentUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </section>
  );
}

function PayStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="bg-accent-wash text-accent flex size-7 shrink-0 items-center
          justify-center rounded-full text-xs font-semibold"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          <span className="sr-only">Step {n}. </span>
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

function PaymentHistory({
  submissions,
  loading,
  errored,
  refreshing,
  onRetry,
  currency,
  paidThrough,
}: {
  submissions: PaymentSubmission[];
  loading: boolean;
  errored: boolean;
  refreshing: boolean;
  onRetry: () => void;
  currency: string;
  paidThrough: string | null;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Payment submissions</h3>
        {refreshing && (
          <span className="text-xs text-mute" role="status">
            Updating…
          </span>
        )}
      </div>

      {loading && (
        <div aria-hidden="true" className="space-y-2">
          {[0, 1].map((row) => (
            <div key={row} className="skeleton h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && errored && (
        <div
          role="alert"
          className="rounded-md border border-line bg-card px-4 py-4 text-sm"
        >
          <p className="text-mute">Could not load your submissions.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 font-medium text-accent underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !errored && submissions.length === 0 && (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-sm text-mute">
          No slips submitted yet. After you transfer, upload the proof above.
        </p>
      )}

      {!loading && !errored && submissions.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
          {submissions.map((row) => {
            const state = SUBMISSION_STATUS[row.status];
            return (
              <li key={row.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium">
                    {formatAmount(row.amount, currency)}
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.tone}`}
                  >
                    {state.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-mute">
                  Transferred {formatPlainDay(row.transfer_date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {row.transfer_reference
                    ? ` · ${row.transfer_reference}`
                    : ""}
                </p>
                <p className="mt-1 text-sm text-mute">
                  {state.detail(row, paidThrough)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PayLink({ business }: { business: string }) {
  const subject = encodeURIComponent(`Glaux Ledger payment for ${business}`);
  return (
    <a
      href={`mailto:${BILLING.supportEmail}?subject=${subject}`}
      className="font-medium text-accent underline underline-offset-2"
    >
      {BILLING.supportEmail}
    </a>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-mute">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function CategorySettings() {
  const { data: categories = [], isPending } = useCategories(true);
  const createCategory = useCreateCategory();
  const toast = useToast();

  const [name, setName] = useState("");
  const [type, setType] = useState<EntryType>("expense");
  const [error, setError] = useState<string | null>(null);

  const { active, retired } = useMemo(() => split(categories), [categories]);

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await createCategory.mutateAsync({ name: trimmed, type });
      setName("");
      toast(`${trimmed} added.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add that category.",
      );
    }
  }

  return (
    <section>
      <h2 className="eyebrow eyebrow-dot mb-4">Categories</h2>

      <form
        onSubmit={onAdd}
        className="flex flex-col gap-3 rounded-md border border-line bg-card p-4 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor="new-category"
            className="mb-1.5 block text-xs font-medium text-mute"
          >
            New category
          </label>
          <input
            id="new-category"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Lamination"
            maxLength={60}
            className="min-h-11 w-full rounded-sm border border-line bg-card px-3
              placeholder:text-mute focus:border-accent"
          />
        </div>

        <div>
          <span
            id="new-category-type"
            className="mb-1.5 block text-xs font-medium text-mute"
          >
            Direction
          </span>
          <div
            role="group"
            aria-labelledby="new-category-type"
            className="flex gap-1 rounded-sm border border-line bg-sunk p-1"
          >
            {(["income", "expense"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={type === option}
                onClick={() => setType(option)}
                className={`min-h-9 rounded-sm px-4 text-sm font-medium transition-colors ${
                  type === option
                    ? `bg-card shadow-sm ${
                        option === "income" ? "text-income" : "text-expense"
                      }`
                    : "text-mute hover:text-ink"
                }`}
              >
                {option === "income" ? "In" : "Out"}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          block={false}
          disabled={!name.trim()}
          loading={createCategory.isPending}
          className="min-h-11 sm:w-auto"
        >
          Add
        </Button>
      </form>

      {error && (
        <p
          role="alert"
          className="bg-expense-wash mt-3 rounded-sm px-3 py-2 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {isPending && (
        <div aria-hidden="true" className="mt-6 space-y-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="skeleton h-14 w-full" />
          ))}
        </div>
      )}

      <CategoryGroup
        title="In use"
        categories={active}
        hint="Tap a name to rename it."
      />

      {retired.length > 0 && (
        <CategoryGroup
          title="Retired"
          categories={retired}
          hint="Kept so past entries keep their labels. They do not appear when recording."
        />
      )}
    </section>
  );
}

function split(categories: Category[]) {
  return {
    active: categories.filter((category) => !category.archived),
    retired: categories.filter((category) => category.archived),
  };
}

function CategoryGroup({
  title,
  categories,
  hint,
}: {
  title: string;
  categories: Category[];
  hint?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {hint && <p className="mb-2 text-xs text-mute">{hint}</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
        {categories.map((category, index) => (
          <CategoryRow key={category.id} category={category} index={index} />
        ))}
      </ul>
    </div>
  );
}

function CategoryRow({
  category,
  index,
}: {
  category: Category;
  index: number;
}) {
  const updateCategory = useUpdateCategory();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);

  async function save() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === category.name) {
      setEditing(false);
      setDraftName(category.name);
      return;
    }
    try {
      await updateCategory.mutateAsync({ id: category.id, name: trimmed });
      setEditing(false);
      toast("Category renamed.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not rename that.",
        "error",
      );
      setDraftName(category.name);
    }
  }

  async function toggleArchived() {
    try {
      await updateCategory.mutateAsync({
        id: category.id,
        archived: !category.archived,
      });
      toast(category.archived ? "Category restored." : "Category retired.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not update that.",
        "error",
      );
    }
  }

  return (
    <Reveal as="li" index={index} className="row-live">
      <div className="row-shift flex items-center gap-3 px-4 py-3">
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") {
                setDraftName(category.name);
                setEditing(false);
              }
            }}
            maxLength={60}
            aria-label={`Rename ${category.name}`}
            className="min-h-10 min-w-0 flex-1 rounded-sm border border-accent-edge bg-card px-3"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left font-medium"
          >
            {category.name}
          </button>
        )}

        <span
          className={`shrink-0 text-xs font-medium ${
            category.type === "income" ? "text-income" : "text-expense"
          }`}
        >
          {category.type === "income" ? "In" : "Out"}
        </span>

        {/* Retire, never delete: transactions reference categories with RESTRICT, and a
            report from last year should still be able to name the category it used. */}
        <button
          type="button"
          onClick={toggleArchived}
          disabled={updateCategory.isPending}
          className="row-action shrink-0 rounded-sm px-2 py-1 text-xs font-medium text-mute
            transition-colors hover:bg-sunk hover:text-accent disabled:opacity-40"
        >
          {category.archived ? "Restore" : "Retire"}
        </button>
      </div>
    </Reveal>
  );
}
