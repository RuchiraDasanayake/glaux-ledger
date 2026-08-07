import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/Button";
import { DraftSheet, type DraftValues } from "@/components/DraftSheet";
import { Money } from "@/components/Money";
import { Page } from "@/components/Page";
import { Reveal } from "@/components/Reveal";
import { useDebounced } from "@/hooks/useDebounced";
import {
  useCategories,
  useSettleTransaction,
  useTransactions,
} from "@/hooks/useLedger";
import { useBusiness } from "@/lib/auth-context";
import { formatDayLabel, formatTime } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import type { EntryType, Transaction } from "@/lib/types";

const PAGE_SIZE = 25;

// A fresh `[]` literal per render would give the grouping memo a new dependency every
// time and defeat it entirely.
const NO_ITEMS: Transaction[] = [];

const DIRECTIONS: Array<{ value: "" | EntryType; label: string }> = [
  { value: "", label: "All" },
  { value: "income", label: "In" },
  { value: "expense", label: "Out" },
];

export function History() {
  const business = useBusiness();
  const { data: categories = [] } = useCategories(true);
  // The dashboard's outstanding strip links straight here, so the unpaid filter has to
  // be addressable rather than only reachable by tapping.
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [direction, setDirection] = useState<"" | EntryType>("");
  const [unpaidOnly, setUnpaidOnly] = useState(
    () => searchParams.get("settled") === "false",
  );
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<DraftValues | null>(null);
  // Open from the start when the dashboard's outstanding strip sent us here already
  // filtered, so the reason this list is short is on screen rather than behind a tap.
  const [filtersOpen, setFiltersOpen] = useState(
    () => searchParams.get("settled") === "false",
  );

  // The query lags the field by a beat, so a page reset has to wait for it too --
  // resetting on every keystroke would put someone back on page 1 mid-word while the
  // list they are still reading belongs to the previous query.
  const query = useDebounced(search.trim());
  useEffect(() => setPage(0), [query]);

  useEffect(() => {
    setUnpaidOnly(searchParams.get("settled") === "false");
  }, [searchParams]);

  const filters = useMemo(
    () => ({
      q: query || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      category_id: categoryId || undefined,
      entry_type: direction || undefined,
      settled: unpaidOnly ? false : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [query, fromDate, toDate, categoryId, direction, unpaidOnly, page],
  );

  const { data, isLoading, isPlaceholderData } = useTransactions(filters);
  const items = data?.items ?? NO_ITEMS;
  const total = data?.total ?? 0;
  const hasFilters = Boolean(
    search || fromDate || toDate || categoryId || direction || unpaidOnly,
  );
  // Search is not counted: it has its own field, always visible, with the term still in
  // it. This number stands in for the controls that are folded away.
  const foldedFilters =
    [fromDate, toDate, categoryId, direction].filter(Boolean).length +
    (unpaidOnly ? 1 : 0);

  // Grouped by local day so a long list reads as a diary rather than a flat dump.
  const grouped = useMemo(
    () => groupByDay(items, business.timezone),
    [items, business.timezone],
  );

  function updateFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(0); // A filtered page 3 would otherwise show nothing.
    };
  }

  function toggleUnpaid() {
    const next = !unpaidOnly;
    setUnpaidOnly(next);
    setPage(0);
    setSearchParams(next ? { settled: "false" } : {}, { replace: true });
  }

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setCategoryId("");
    setDirection("");
    setUnpaidOnly(false);
    setPage(0);
    setSearchParams({}, { replace: true });
  }

  return (
    <Page title="History">
      <div className="rounded-md border border-line bg-card p-4">
        {/* On its own row above the structured filters, and first, because it is the
            one control that answers "where is that entry" without the shopkeeper
            having to translate the memory into a date range and a category. */}
        <SearchField value={search} onChange={setSearch} />

        {/* Phone only. Stacked, the date pair, the category select, the direction group
            and the two buttons ran to about 450px, so History opened as a filter form
            with two entries visible under it. Folded, the list starts near the top of
            the screen, which is what someone came to the page to read. The desktop
            toolbar is one row and costs nothing, so it stays open there. */}
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="history-filters"
          // Spelled out rather than left to the badge. Read off the markup the name comes
          // out "Filters2", which is a different word said aloud.
          aria-label={
            foldedFilters > 0 ? `Filters, ${foldedFilters} set` : "Filters"
          }
          className="mt-3 flex min-h-11 w-full items-center justify-between rounded-sm
            border border-line px-3 text-sm font-medium text-mute transition-colors
            hover:text-ink lg:hidden"
        >
          <span className="flex items-center gap-2">
            Filters
            {foldedFilters > 0 && (
              <span className="rounded-full bg-accent-fill px-2 py-0.5 text-xs text-nyx">
                {foldedFilters}
              </span>
            )}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-[var(--dur-base)]
              ${filtersOpen ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/* Stacked on a phone, a single toolbar row on a desktop. Three short controls
            in a column waste the width and push the list itself below the fold. */}
        <div
          id="history-filters"
          className={`mt-3 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-4
            ${filtersOpen ? "flex" : "hidden lg:flex"}`}
        >
          <div className="flex gap-3 lg:contents">
            <DateField
              label="From"
              value={fromDate}
              onChange={updateFilter(setFromDate)}
            />
            <DateField
              label="To"
              value={toDate}
              onChange={updateFilter(setToDate)}
            />
          </div>

          <div className="lg:min-w-52 lg:flex-1">
            <label
              htmlFor="filter-category"
              className="mb-1.5 block text-xs font-medium text-mute"
            >
              Category
            </label>
            <select
              id="filter-category"
              value={categoryId}
              onChange={(event) =>
                updateFilter(setCategoryId)(event.target.value)
              }
              className="min-h-11 w-full rounded-sm border border-line bg-card px-3 focus:border-accent"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.archived ? " (retired)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span
              id="filter-direction-label"
              className="mb-1.5 block text-xs font-medium text-mute"
            >
              Direction
            </span>
            <div
              role="group"
              aria-labelledby="filter-direction-label"
              className="flex gap-1 rounded-sm border border-line bg-sunk p-1"
            >
              {DIRECTIONS.map((option) => (
                <button
                  key={option.value || "all"}
                  type="button"
                  aria-pressed={direction === option.value}
                  onClick={() => {
                    setDirection(option.value);
                    setPage(0);
                  }}
                  className={`min-h-9 flex-1 rounded-sm px-4 text-sm font-medium transition-colors
                  ${
                    direction === option.value
                      ? "bg-card text-ink shadow-sm"
                      : "text-mute hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Paired on a phone so that Clear costs no height when it becomes available --
            on its own row it appeared the moment a filter was set and pushed the whole
            list down. lg:contents hands both back to the toolbar row on a desktop.
            Rendered always and disabled rather than hidden, for the same reason. */}
          <div className="flex items-center gap-4 lg:contents">
            <button
              type="button"
              aria-pressed={unpaidOnly}
              onClick={toggleUnpaid}
              className={`min-h-11 rounded-sm border px-4 text-sm font-medium
              transition-colors lg:self-end ${
                unpaidOnly
                  ? "border-accent-edge bg-accent-fill text-nyx"
                  : "border-line bg-card text-mute hover:border-accent-edge hover:text-ink"
              }`}
            >
              Unpaid only
            </button>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="text-sm font-medium text-accent underline underline-offset-4
              transition-opacity disabled:cursor-default disabled:text-mute
              disabled:no-underline disabled:opacity-40 lg:mb-3 lg:self-end"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <p
        aria-live="polite"
        className={`mt-4 text-sm text-mute transition-opacity duration-[var(--dur-base)]
          ${isPlaceholderData ? "opacity-45" : ""}`}
      >
        {isLoading
          ? "Loading…"
          : `${total} ${total === 1 ? "entry" : "entries"}`}
      </p>

      {isLoading && <HistorySkeleton />}

      {!isLoading && items.length === 0 && (
        <p className="mt-6 rounded-md border border-line bg-card px-4 py-8 text-center text-sm text-mute">
          {query
            ? `Nothing matches “${query}”.`
            : hasFilters
              ? "Nothing matches those filters."
              : "No entries recorded yet."}
        </p>
      )}

      {/* Filtering and paging fade the outgoing list in place rather than swapping it
          for a skeleton of a different length, so the page never jumps between one
          answer and the next. */}
      <div
        aria-busy={isPlaceholderData}
        className={`mt-4 flex flex-col gap-6 transition-opacity duration-[var(--dur-base)]
          ${isPlaceholderData ? "opacity-45" : ""}`}
      >
        {grouped.map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="eyebrow eyebrow-dot mb-2">{day}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
              {dayItems.map((transaction, index) => (
                <EntryRow
                  key={transaction.id}
                  transaction={transaction}
                  index={index}
                  currency={business.currency}
                  timezone={business.timezone}
                  onEdit={() => setEditing(toEditableDraft(transaction))}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <DraftSheet
        open={editing !== null}
        draft={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    </Page>
  );
}

/**
 * The whole row opens the editor.
 *
 * An earlier version put edit and void behind icon buttons at the end of the row. There
 * is no hover on a phone to hide them behind, so three targets sat permanently in a
 * 390px row and squeezed the category down to "Stock & Sup". Tapping the row is both
 * the bigger target and the more obvious gesture, and void belongs inside the sheet
 * anyway, where a destructive action can be confirmed properly.
 *
 * Settling stays out here on its own, because it is the one action worth doing without
 * opening anything: paying off three bills should be three taps.
 */
function EntryRow({
  transaction,
  index,
  currency,
  timezone,
  onEdit,
}: {
  transaction: Transaction;
  index: number;
  currency: string;
  timezone: string;
  onEdit: () => void;
}) {
  const settle = useSettleTransaction();
  const toast = useToast();

  const overdue =
    !transaction.settled &&
    transaction.due_date !== null &&
    transaction.due_date < new Date().toISOString().slice(0, 10);

  async function onSettle() {
    try {
      await settle.mutateAsync({ id: transaction.id });
      toast("Marked as paid.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Could not update that.",
        "error",
      );
    }
  }

  return (
    <Reveal as="li" index={index} className="row-live">
      <div className="row-shift flex items-center">
        {/* Two rows stacked under one another on a narrow screen; three columns on a wide
            one, where stacking would leave the amount alone at the far right of an
            otherwise empty line. Same three children either way, with only the template
            changing, so there is one row in the DOM rather than a phone one and a
            desktop one to keep in agreement.

            The amount's column sizes to its content and sits flush against the row's
            right padding, so every figure in the list shares a right edge whatever its
            length. That shared edge is what makes a 2560px list readable: the eye reads
            down a column of figures instead of across a hand's width of blank paper. */}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${transaction.category.name}`}
          className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center
            gap-x-3 px-4 py-3 text-left
            xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_auto]"
        >
          {/* The category gets the whole first line. The unpaid badge used to sit beside
              it and cost enough width to cut "Stock & Supplies" down to "Stock & Sup" --
              the badge is still unmissable on the line below. */}
          <span className="min-w-0 truncate font-medium">
            {transaction.category.name}
          </span>

          <span
            className="col-start-1 mt-0.5 flex min-w-0 items-center gap-1.5 text-sm
              text-mute xl:col-start-2 xl:row-start-1 xl:mt-0"
          >
            {!transaction.settled && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  overdue
                    ? "bg-expense-wash text-expense"
                    : "bg-accent-wash text-accent"
                }`}
              >
                {overdue ? "Overdue" : "Unpaid"}
              </span>
            )}
            <span className="truncate">
              {formatTime(transaction.occurred_at, timezone)}
              {transaction.counterparty && ` · ${transaction.counterparty}`}
              {transaction.note && ` · ${transaction.note}`}
              {transaction.source && transaction.source !== "manual" && (
                <span className="ml-1 text-xs">({transaction.source})</span>
              )}
            </span>
          </span>

          <Money
            value={transaction.amount}
            currency={currency}
            type={transaction.entry_type}
            signed
            className="col-start-2 row-span-2 row-start-1 justify-self-end
              xl:col-start-3 xl:row-span-1"
          />
        </button>

        {!transaction.settled && (
          <button
            type="button"
            onClick={onSettle}
            disabled={settle.isPending}
            aria-label={`Mark ${transaction.category.name} as paid`}
            title="Mark as paid"
            className="mr-2 flex size-10 shrink-0 items-center justify-center rounded-sm
              text-mute transition-colors hover:bg-income-wash hover:text-income
              disabled:opacity-40"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m4.5 12.5 5 5 10-11" />
            </svg>
          </button>
        )}
      </div>
    </Reveal>
  );
}

function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="mt-4">
      <div className="skeleton mb-2 h-3 w-28" />
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <li
            key={row}
            className="flex items-center justify-between px-4 py-3.5"
          >
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-32" />
              <div className="skeleton h-3 w-48" />
            </div>
            <div className="skeleton h-4 w-20" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One field over the note, the supplier and the category name.
 *
 * Deliberately not three. A shopkeeper looking for the August electricity bill does not
 * know which of those fields they wrote "CEB" in, and asking them to pick is asking
 * them to remember how they typed it eleven months ago.
 */
function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <label htmlFor="filter-search" className="sr-only">
        Search entries
      </label>
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="filter-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Two of the three rather than all three: the full list ran past the right edge
        // of a 390px field and clipped to "categorie", which reads as a broken field.
        // Categories are the searchable thing a shopkeeper can already guess at, since
        // the names are their own; notes and suppliers are the ones worth advertising.
        placeholder="Search notes or suppliers"
        className="min-h-11 w-full rounded-sm border border-line bg-card pr-3 pl-10
          focus:border-accent"
      />
      {/* Cleared from the keyboard as well as by the native ✕, which a phone shows and
          a desktop browser mostly does not. */}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 hidden size-9 -translate-y-1/2 items-center
            justify-center rounded-sm text-mute hover:text-ink lg:flex"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    // min-w-0 matters: a native date input's intrinsic width exceeds the flex basis at
    // phone width, so without it the second field overflows the card. On the desktop
    // toolbar it stops growing instead: a date field is a fixed-length thing.
    <div className="min-w-0 flex-1 lg:w-40 lg:flex-none">
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
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-sm border border-line bg-card px-3 focus:border-accent"
      />
    </div>
  );
}

function toEditableDraft(transaction: Transaction): DraftValues {
  return {
    amount: transaction.amount,
    categoryId: transaction.category.id,
    note: transaction.note ?? "",
    source: transaction.source ?? "manual",
    counterparty: transaction.counterparty ?? "",
    onCredit: !transaction.settled,
    editing: transaction,
  };
}

function groupByDay(
  transactions: Transaction[],
  timeZone: string,
): Array<[string, Transaction[]]> {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const day = formatDayLabel(transaction.occurred_at, timeZone);
    const existing = groups.get(day);
    if (existing) existing.push(transaction);
    else groups.set(day, [transaction]);
  }
  // Map preserves insertion order, and the API already returns newest first.
  return [...groups.entries()];
}
