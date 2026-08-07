import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import {
  useCategories,
  useCounterparties,
  useCreateTransaction,
  useUpdateTransaction,
  useVoidTransaction,
} from "@/hooks/useLedger";
import { useBusiness } from "@/lib/auth-context";
import { todayInZone } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import type {
  Category,
  EntrySource,
  EntryType,
  PaymentMethod,
  Transaction,
} from "@/lib/types";

export interface DraftValues {
  amount: string;
  categoryId: string | null;
  note: string;
  source: EntrySource;
  /** What the parser heard or read. Shown so a wrong parse is diagnosable. */
  rawText?: string;
  /** Fields the parser was unsure about, flagged for review. */
  uncertain?: Array<"amount" | "category" | "note">;
  counterparty?: string;
  onCredit?: boolean;
  /** Present only when an existing entry is being corrected rather than created. */
  editing?: Transaction;
}

interface DraftSheetProps {
  open: boolean;
  draft: DraftValues | null;
  onClose: () => void;
  onSaved: () => void;
}

const TITLES: Record<EntrySource, string> = {
  manual: "New entry",
  voice: "Check this entry",
  photo: "Check this entry",
};

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "credit", label: "Credit" },
];

export function DraftSheet({ open, draft, onClose, onSaved }: DraftSheetProps) {
  const business = useBusiness();
  const { data: categories = [] } = useCategories();
  const { data: knownPayees = [] } = useCounterparties();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const voidTransaction = useVoidTransaction();
  const toast = useToast();

  const [direction, setDirection] = useState<EntryType>("income");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [dueDate, setDueDate] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever a new draft arrives, so a previous entry never bleeds into this one.
  useEffect(() => {
    if (!draft) return;
    const existing = draft.editing;
    const suggested = draft.categoryId
      ? categories.find((c) => c.id === draft.categoryId)
      : undefined;

    setAmount(draft.amount);
    setCategoryId(draft.categoryId);
    setNote(draft.note);
    setCounterparty(draft.counterparty ?? "");
    setDirection(suggested?.type ?? (draft.onCredit ? "expense" : "income"));
    setDate(
      existing
        ? isoToDateInput(existing.occurred_at, business.timezone)
        : todayInZone(business.timezone),
    );
    setPaymentMethod(
      existing?.payment_method ?? (draft.onCredit ? "credit" : "cash"),
    );
    setDueDate(existing?.due_date ?? "");
    // Opened for anything the parser or the entry itself already put behind it, so a
    // detail that is set is never hidden from the person checking it.
    setShowMore(
      Boolean(
        draft.onCredit ||
        draft.counterparty ||
        existing?.counterparty ||
        existing?.due_date ||
        (existing && !existing.settled),
      ),
    );
    setConfirmingVoid(false);
    setError(null);
  }, [draft, business.timezone, categories]);

  const bySide = useMemo(
    () => ({
      income: categories.filter((category) => category.type === "income"),
      expense: categories.filter((category) => category.type === "expense"),
    }),
    [categories],
  );

  const visibleCategories = bySide[direction];
  // Both sides render this many cells, the shorter one padded with blanks. Without it
  // the grid gains or loses a row on every switch and the sheet resizes under the thumb.
  const slots = Math.max(bySide.income.length, bySide.expense.length);

  if (!draft) return null;

  const editing = draft.editing;
  const uncertain = new Set(draft.uncertain ?? []);
  const parsed = Number(amount);
  const onCredit = paymentMethod === "credit";
  const canSave = categoryId !== null && Number.isFinite(parsed) && parsed > 0;

  function chooseDirection(next: EntryType) {
    setDirection(next);
    // The chips below are about to be replaced wholesale, so a selection from the other
    // side would silently persist and save an entry in the wrong direction.
    setCategoryId(null);
  }

  async function onSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSave || !categoryId) return;
    setError(null);

    const payload = {
      category_id: categoryId,
      amount: parsed.toFixed(2),
      note: note.trim() || null,
      counterparty: counterparty.trim() || null,
      payment_method: paymentMethod,
      due_date: onCredit && dueDate ? dueDate : null,
      occurred_at: dateInputToIso(date, business.timezone),
    };

    try {
      if (editing) {
        await updateTransaction.mutateAsync({ id: editing.id, ...payload });
        toast("Entry updated.");
      } else {
        await createTransaction.mutateAsync({
          ...payload,
          source: draft!.source,
          // A credit purchase is money not yet handed over, which is the whole point of
          // the outstanding total.
          settled: !onCredit,
        });
        toast(onCredit ? "Saved as unpaid." : "Entry saved.");
      }
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save that entry.",
      );
    }
  }

  async function onVoid() {
    if (!editing) return;
    try {
      await voidTransaction.mutateAsync(editing.id);
      toast("Entry voided.");
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not void that entry.",
      );
      setConfirmingVoid(false);
    }
  }

  const saving = createTransaction.isPending || updateTransaction.isPending;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit entry" : TITLES[draft.source]}
    >
      {/* A real form, so the keypad's Go key saves. Every other control below is
          explicitly type="button", because an implicit submit from one of them would file the
          entry while someone was still choosing a category. */}
      <form onSubmit={onSave} className="flex flex-col gap-5 pb-5">
        {draft.rawText && (
          <p className="rounded-sm bg-paper px-3 py-2 text-sm text-mute">
            <span className="mr-1 font-medium text-ink">Heard:</span>
            {draft.rawText}
          </p>
        )}

        {/* Direction first, because it halves the chip list below it. Before this,
            every category from both sides was on screen at once and a shopkeeper
            recording a sale had to read past six kinds of cost to find it. */}
        <div
          role="radiogroup"
          aria-label="Direction"
          className="grid grid-cols-2 gap-1 rounded-md border border-line bg-sunk p-1"
        >
          <DirectionTab
            label="Money in"
            active={direction === "income"}
            tone="income"
            onSelect={() => chooseDirection("income")}
          />
          <DirectionTab
            label="Money out"
            active={direction === "expense"}
            tone="expense"
            onSelect={() => chooseDirection("expense")}
          />
        </div>

        <div>
          <label
            htmlFor="draft-amount"
            className="mb-1.5 block text-sm font-medium"
          >
            Amount
            {uncertain.has("amount") && <ReviewFlag />}
          </label>
          <input
            id="draft-amount"
            // Opens the numeric keypad without forcing a strict number input, which on
            // some Android keyboards hides the decimal separator entirely.
            inputMode="decimal"
            type="text"
            data-sheet-focus
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d.]/g, ""))
            }
            placeholder="0"
            autoComplete="off"
            // Gold on an uncertain field is the brand's own meaning for gleam: attention.
            className={`tabular focus:border-accent min-h-16 w-full rounded-md
              border bg-card px-4 text-3xl font-semibold
              ${
                uncertain.has("amount")
                  ? "border-accent-edge ring-accent-edge/30 ring-1"
                  : "border-line"
              }`}
          />
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium">
            Category
            {uncertain.has("category") && <ReviewFlag />}
          </span>
          {/* Tiles, not a dropdown: one tap instead of two, and every option stays
              visible. A fixed grid rather than a wrapping row, because pills sized to
              their labels put a category in a different place on every render, and
              the two sides wrapped to different heights, so switching direction moved
              the whole sheet. Fixed cells mean Printing is always in the same spot,
              which is the difference between reading the sheet and knowing it. */}
          <div
            key={direction}
            className="animate-fade-in grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {visibleCategories.map((category) => (
              <CategoryChip
                key={category.id}
                category={category}
                selected={category.id === categoryId}
                onSelect={() => setCategoryId(category.id)}
              />
            ))}
            {Array.from(
              { length: slots - visibleCategories.length },
              (_, i) => (
                <span
                  key={`blank-${i}`}
                  aria-hidden="true"
                  className="min-h-11"
                />
              ),
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="draft-note"
            className="mb-1.5 block text-sm font-medium"
          >
            Note <span className="font-normal text-mute">(optional)</span>
          </label>
          <input
            id="draft-note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. 200 colour pages"
            maxLength={500}
            className="min-h-12 w-full rounded-md border border-line bg-card px-4
              placeholder:text-mute focus:border-accent"
          />
        </div>

        {/* Behind a disclosure so recording a counter sale stays amount, category, save.
            Everything here matters for a supplier bill and for nothing else. */}
        <div className="rounded-md border border-line">
          <button
            type="button"
            onClick={() => setShowMore((current) => !current)}
            aria-expanded={showMore}
            className="flex min-h-12 w-full items-center justify-between px-4 text-sm
              font-medium transition-colors hover:bg-sunk"
          >
            <span>More details</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`text-mute transition-transform duration-200 ${
                showMore ? "rotate-180" : ""
              }`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {showMore && (
            <div className="animate-fade-in flex flex-col gap-4 border-t border-line px-4 py-4">
              <Field label="Date" htmlFor="draft-date">
                <input
                  id="draft-date"
                  type="date"
                  value={date}
                  max={todayInZone(business.timezone)}
                  onChange={(event) => setDate(event.target.value)}
                  className="min-h-12 w-full min-w-0 rounded-md border border-line bg-card px-3
                    focus:border-accent"
                />
              </Field>

              <Field
                label={direction === "expense" ? "Paid to" : "Received from"}
                htmlFor="draft-counterparty"
              >
                <input
                  id="draft-counterparty"
                  type="text"
                  value={counterparty}
                  onChange={(event) => setCounterparty(event.target.value)}
                  list="known-counterparties"
                  placeholder="e.g. City Paper Supplies"
                  maxLength={120}
                  className="min-h-12 w-full rounded-md border border-line bg-card px-3
                    placeholder:text-mute focus:border-accent"
                />
                <datalist id="known-counterparties">
                  {knownPayees.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">
                  Payment method
                </legend>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      aria-pressed={paymentMethod === method.value}
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium
                        transition-colors ${
                          paymentMethod === method.value
                            ? "border-accent-edge bg-accent-fill text-nyx"
                            : "border-line bg-card text-mute hover:border-accent-edge"
                        }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                {onCredit && (
                  <p className="mt-2 text-sm text-mute">
                    Recorded as unpaid, and counted in what you owe until you
                    settle it.
                  </p>
                )}
              </fieldset>

              {onCredit && (
                <Field label="Due date" htmlFor="draft-due" optional>
                  <input
                    id="draft-due"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="min-h-12 w-full min-w-0 rounded-md border border-line bg-card px-3
                      focus:border-accent"
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-sm bg-expense/8 px-3 py-2 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave} loading={saving}>
            {editing ? "Save changes" : "Save entry"}
          </Button>
        </div>

        {/* Voiding is separated from the save row by a rule and phrased as what it does
            rather than as "Delete", because the row survives: it stops counting.
            Deleting outright is not offered at all: a book that can lose rows cannot
            be audited. */}
        {editing && (
          <>
            <hr className="rule" />
            {confirmingVoid ? (
              <div className="bg-expense-wash animate-fade-in rounded-md px-4 py-3">
                <p className="text-sm text-expense">
                  Void this entry? It stays on the record for the audit trail
                  but stops counting towards any total.
                </p>
                <div className="mt-3 flex gap-3">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setConfirmingVoid(false)}
                  >
                    Keep it
                  </Button>
                  <button
                    type="button"
                    onClick={onVoid}
                    disabled={voidTransaction.isPending}
                    className="min-h-12 w-full rounded-md bg-expense px-5 font-medium
                      text-inverse transition-opacity disabled:opacity-50"
                  >
                    Void it
                  </button>
                </div>
              </div>
            ) : (
              <Button
                variant="danger"
                type="button"
                onClick={() => setConfirmingVoid(true)}
              >
                Void this entry
              </Button>
            )}
          </>
        )}
      </form>
    </BottomSheet>
  );
}

function DirectionTab({
  label,
  active,
  tone,
  onSelect,
}: {
  label: string;
  active: boolean;
  tone: "income" | "expense";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`min-h-11 rounded-sm text-sm font-medium transition-colors ${
        active
          ? `bg-card shadow-sm ${tone === "income" ? "text-income" : "text-expense"}`
          : "text-mute"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  htmlFor,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-mute">(optional)</span>
        )}
      </label>
      {children}
    </div>
  );
}

function CategoryChip({
  category,
  selected,
  onSelect,
}: {
  category: Category;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = category.type === "income" ? "text-income" : "text-expense";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      // Left-aligned and truncating: a column of names is read down its first letters,
      // and a long one has to shorten rather than widen its cell.
      title={category.name}
      className={`min-h-11 w-full truncate rounded-md border px-3 text-left text-sm
        font-medium transition-colors
        ${
          selected
            ? "border-accent-edge bg-accent-fill text-nyx"
            : `border-line bg-card hover:border-accent-edge ${tone}`
        }`}
    >
      {category.name}
    </button>
  );
}

function ReviewFlag() {
  return (
    <span className="bg-accent-wash text-accent ml-2 rounded-full px-2 py-0.5 text-xs font-medium">
      check this
    </span>
  );
}

/**
 * A date input gives a local calendar day; the API wants an instant.
 *
 * Midday, not midnight: a shop in Colombo saving "today" at midnight local time would
 * be sent as the previous day in UTC, and the summary would file it under yesterday.
 * Noon is far enough from either boundary that no timezone can shift the date.
 */
function dateInputToIso(day: string, timeZone: string): string {
  if (!day) return new Date().toISOString();
  if (day === todayInZone(timeZone)) return new Date().toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}

function isoToDateInput(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
