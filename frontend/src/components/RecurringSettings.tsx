import { useState } from "react";
import { Button } from "@/components/Button";
import { Money } from "@/components/Money";
import { Reveal } from "@/components/Reveal";
import { useCategories } from "@/hooks/useLedger";
import {
  useCreateRecurring,
  useDeleteRecurring,
  useRecurringBills,
  useUpdateRecurring,
} from "@/hooks/useRecurring";
import { useBusiness } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import type { Category, RecurringBill } from "@/lib/types";

const LAST_SAFE_DAY = 28;

/**
 * The shop's standing costs: rent, electricity, wages.
 *
 * Managed here rather than on the entry screen, which shows only what is owed today.
 * These are set once and then left alone for a year, so they belong with the other
 * once-a-year decisions.
 */
export function RecurringSettings() {
  const { currency } = useBusiness();
  const { data: bills = [], isPending } = useRecurringBills();
  const { data: categories = [] } = useCategories();
  const [adding, setAdding] = useState(false);

  // Six fields is a lot of furniture to leave standing open above a list that is the
  // reason most visits here happen. Open by default only when there is no list yet,
  // since then adding one is the only thing to do.
  const empty = !isPending && bills.length === 0;
  const formOpen = adding || empty;

  return (
    <section>
      <h2 className="eyebrow eyebrow-dot mb-1">Recurring bills</h2>
      <p className="mb-4 text-sm text-mute">
        Set the rent once and the app offers it each month, at the usual amount.
        Nothing is recorded until you confirm it, so a bill that changes is
        still your figure and not a guess.
      </p>

      {isPending && (
        <div aria-hidden="true" className="space-y-2">
          {[0, 1].map((row) => (
            <div key={row} className="skeleton h-16 w-full" />
          ))}
        </div>
      )}

      {bills.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
          {bills.map((bill, index) => (
            <BillRow
              key={bill.id}
              bill={bill}
              index={index}
              currency={currency}
            />
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className={bills.length > 0 ? "mt-4" : ""}>
          <AddBillForm
            categories={categories}
            onAdded={() => setAdding(false)}
          />
        </div>
      ) : (
        !isPending && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 min-h-11 rounded-sm border border-dashed border-line px-4
              text-sm font-medium text-mute transition-colors hover:border-accent hover:text-accent"
          >
            Add a bill
          </button>
        )
      )}
    </section>
  );
}

function AddBillForm({
  categories,
  onAdded,
}: {
  categories: Category[];
  onAdded: () => void;
}) {
  const create = useCreateRecurring();
  const toast = useToast();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [day, setDay] = useState("1");
  const [counterparty, setCounterparty] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(name.trim() && amount && categoryId);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        amount,
        category_id: categoryId,
        day_of_month: Number(day),
        counterparty: counterparty.trim() || null,
      });
      setName("");
      setAmount("");
      setCounterparty("");
      toast("Bill added.");
      onAdded();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add that bill.",
      );
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-md border border-line bg-card p-4 sm:grid-cols-2"
    >
      <Field label="Name" htmlFor="bill-name">
        <input
          id="bill-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Shop rent"
          maxLength={60}
          className={INPUT}
        />
      </Field>

      <Field label="Usual amount" htmlFor="bill-amount">
        <input
          id="bill-amount"
          // inputMode over type="number": a spinner on a money field is a way to
          // change an amount by one rupee at a time, which nobody wants.
          inputMode="decimal"
          value={amount}
          onChange={(event) =>
            setAmount(event.target.value.replace(/[^\d.]/g, ""))
          }
          placeholder="0.00"
          className={`${INPUT} tabular`}
        />
      </Field>

      <Field label="Category" htmlFor="bill-category">
        <select
          id="bill-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={INPUT}
        >
          <option value="">Choose one</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Day of the month" htmlFor="bill-day">
        <select
          id="bill-day"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className={INPUT}
        >
          {Array.from({ length: LAST_SAFE_DAY }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {ordinal(value)}
              </option>
            ),
          )}
        </select>
      </Field>

      <Field label="Paid to (optional)" htmlFor="bill-counterparty">
        <input
          id="bill-counterparty"
          value={counterparty}
          onChange={(event) => setCounterparty(event.target.value)}
          placeholder="e.g. CEB"
          maxLength={120}
          className={INPUT}
        />
      </Field>

      <div className="flex items-end">
        <Button
          type="submit"
          block={false}
          disabled={!ready}
          loading={create.isPending}
          className="min-h-11 w-full sm:w-auto"
        >
          Add bill
        </Button>
      </div>

      {/* Only 1 to 28 are offered. The 29th to the 31st would skip February, and
          quietly moving such a bill to the 28th is a different promise. */}
      <p className="text-xs text-mute sm:col-span-2">
        Days run to the 28th, so no bill can skip a February.
      </p>

      {error && (
        <p
          role="alert"
          className="bg-expense-wash rounded-sm px-3 py-2 text-sm text-expense sm:col-span-2"
        >
          {error}
        </p>
      )}
    </form>
  );
}

function BillRow({
  bill,
  index,
  currency,
}: {
  bill: RecurringBill;
  index: number;
  currency: string;
}) {
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  async function run(action: Promise<unknown>, done: string) {
    try {
      await action;
      toast(done);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not update that.",
        "error",
      );
    }
  }

  return (
    <Reveal as="li" index={index} className="row-live">
      <div className="row-shift flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        {/* A whole line to itself on a phone, where sharing one with the amount and two
            actions cut the schedule down to "1st of the mont". From sm it shares again
            and takes the free space, which puts the amount and the actions on the right. */}
        <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <span
            className={`block truncate font-medium ${bill.active ? "" : "text-mute"}`}
          >
            {bill.name}
          </span>
          <span className="mt-0.5 block truncate text-sm text-mute">
            {ordinal(bill.day_of_month)} of the month · {bill.category.name}
            {bill.counterparty && ` · ${bill.counterparty}`}
            {!bill.active && " · paused"}
            {bill.active && bill.recorded_this_month && " · recorded"}
          </span>
        </span>

        <Money
          value={bill.amount}
          currency={currency}
          type={bill.category.type}
          className="shrink-0"
        />

        {/* ml-auto only bites on the phone's second line, where the name is not there to
            absorb the free space and push these to the right edge. */}
        {confirming ? (
          <span className="ml-auto flex shrink-0 items-center gap-2 text-sm">
            <span className="text-mute">Remove?</span>
            <button
              type="button"
              onClick={() =>
                run(remove.mutateAsync(bill.id), `${bill.name} removed.`)
              }
              className="rounded-sm px-2 py-1 font-medium text-expense hover:bg-expense-wash"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-sm px-2 py-1 font-medium text-mute hover:text-ink"
            >
              No
            </button>
          </span>
        ) : (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <RowAction
              onClick={() =>
                run(
                  update.mutateAsync({ id: bill.id, active: !bill.active }),
                  bill.active
                    ? `${bill.name} paused.`
                    : `${bill.name} resumed.`,
                )
              }
              disabled={update.isPending}
            >
              {bill.active ? "Pause" : "Resume"}
            </RowAction>
            {/* Removing the template never touches the entries it produced; those
                carry their own copy of every field. */}
            <RowAction onClick={() => setConfirming(true)}>Remove</RowAction>
          </span>
        )}
      </div>
    </Reveal>
  );
}

const INPUT =
  "min-h-11 w-full rounded-sm border border-line bg-card px-3 placeholder:text-mute focus:border-accent";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium text-mute"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function RowAction({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="row-action rounded-sm px-2 py-1 text-xs font-medium text-mute
        transition-colors hover:bg-sunk hover:text-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ordinal(day: number): string {
  // 11th to 13th break the last-digit rule, which is why this is not a lookup on n % 10.
  const teens = day % 100;
  if (teens >= 11 && teens <= 13) return `${day}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th";
  return `${day}${suffix}`;
}
