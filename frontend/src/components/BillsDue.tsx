import { useState } from "react";
import { Link } from "react-router-dom";
import { Money } from "@/components/Money";
import { useRecordRecurring, useRecurringBills } from "@/hooks/useRecurring";
import { formatPlainDay } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import type { RecurringBill } from "@/lib/types";

/**
 * The standing costs that are owed this month and not yet written down.
 *
 * Offered, never posted. An electricity bill is a different figure every month, so a
 * scheduler that wrote one in would be inventing a number and calling it a record; this
 * asks, with the usual amount already filled in, and takes one tap when that amount is
 * right. Nothing here appears unless something is actually due, because a permanent
 * "no bills due" panel is furniture.
 */
export function BillsDue({ currency }: { currency: string }) {
  const { data: bills } = useRecurringBills(false);
  const due = (bills ?? []).filter((bill) => bill.due);

  if (due.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="eyebrow eyebrow-dot mb-2">
        {due.length === 1 ? "A bill is due" : `${due.length} bills are due`}
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-accent-edge bg-card">
        {due.map((bill) => (
          <DueRow key={bill.id} bill={bill} currency={currency} />
        ))}
      </ul>
      <p className="mt-2 text-xs text-mute">
        Recorded at the usual amount.{" "}
        <Link to="/settings" className="underline underline-offset-2">
          Manage bills
        </Link>
      </p>
    </section>
  );
}

function DueRow({ bill, currency }: { bill: RecurringBill; currency: string }) {
  const record = useRecordRecurring();
  const toast = useToast();
  // Local, because two bills due on the same day are two separate mutations and a
  // shared pending flag would grey out the one that was not clicked.
  const [saving, setSaving] = useState(false);

  async function onRecord() {
    setSaving(true);
    try {
      await record.mutateAsync({ id: bill.id });
      toast(`${bill.name} recorded.`);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not record that.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{bill.name}</span>
        <span className="mt-0.5 block truncate text-sm text-mute">
          Due {formatPlainDay(bill.due_on)}
          {bill.counterparty && ` · ${bill.counterparty}`}
        </span>
      </span>

      <Money
        value={bill.amount}
        currency={currency}
        type={bill.category.type}
        className="shrink-0"
      />

      <button
        type="button"
        onClick={onRecord}
        disabled={saving}
        className="min-h-9 shrink-0 rounded-sm bg-accent-fill px-3 text-sm font-medium
          text-nyx transition-opacity disabled:opacity-50"
      >
        {saving ? "Saving…" : "Record"}
      </button>
    </li>
  );
}
