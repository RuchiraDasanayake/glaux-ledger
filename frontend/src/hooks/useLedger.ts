import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Category,
  DailySeries,
  EntryType,
  PaymentMethod,
  Period,
  Summary,
  Transaction,
  TransactionPage,
} from "@/lib/types";

export interface TransactionFilters {
  from_date?: string;
  to_date?: string;
  category_id?: string;
  entry_type?: string;
  settled?: boolean;
  /** Words to find in the note, the supplier or the category name. */
  q?: string;
  include_voided?: boolean;
  limit?: number;
  offset?: number;
}

function toQuery(
  filters: Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Every write touches the same three reads, so they are invalidated together rather
 * than each mutation picking its own subset and one of them forgetting the summary.
 */
function useLedgerInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["daily"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    // A recorded bill stops being due, and voiding that entry makes it due again --
    // both are decided server-side from the transactions this just changed.
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
  };
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", includeArchived],
    queryFn: () =>
      api.get<Category[]>(
        `/categories${includeArchived ? "?include_archived=true" : ""}`,
      ),
    // Categories change rarely; refetching them on every screen is wasted data on a
    // phone connection.
    staleTime: 5 * 60 * 1000,
  });
}

// Changing the period, a filter or the page is a new query key, so by default the screen
// empties to a loading state and refills. That reads as two jumps for what the shopkeeper
// performed as one tap, and the skeleton is never the height of the answer it stands in
// for. Holding the previous result means the figures stay put and update in place; the
// surfaces mark themselves stale meanwhile via isPlaceholderData.
export function useSummary(period: Period) {
  return useQuery({
    queryKey: ["summary", period],
    queryFn: () => api.get<Summary>(`/transactions/summary?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * The same figures for an arbitrary range rather than a named period.
 *
 * Export uses it to show what a report will contain before it is built. A PDF is a slow,
 * opaque way to discover that the dates were wrong, and the endpoint already accepts a
 * range, so the answer costs one query rather than a download and a squint.
 */
export function useRangeSummary(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ["summary", "range", fromDate, toDate],
    queryFn: () =>
      api.get<Summary>(
        `/transactions/summary?from_date=${fromDate}&to_date=${toDate}`,
      ),
    enabled: fromDate <= toDate,
    placeholderData: keepPreviousData,
  });
}

/**
 * A trailing window of daily totals for the trend chart, ending today.
 *
 * Deliberately not keyed to the dashboard's period tabs: the tabs answer "how much
 * today", the chart answers "how has the shop been", and switching tabs should not
 * redraw an answer to a question that did not change.
 */
export function useDailySeries(days = 30) {
  return useQuery({
    queryKey: ["daily", days],
    queryFn: () => api.get<DailySeries>(`/transactions/daily?days=${days}`),
    placeholderData: keepPreviousData,
  });
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () =>
      api.get<TransactionPage>(`/transactions${toQuery({ ...filters })}`),
    placeholderData: keepPreviousData,
  });
}

/** Past suppliers, for the counterparty field's datalist. */
export function useCounterparties() {
  return useQuery({
    queryKey: ["counterparties"],
    queryFn: () => api.get<string[]>("/transactions/counterparties"),
    staleTime: 5 * 60 * 1000,
  });
}

export interface NewTransaction {
  category_id: string;
  amount: string;
  note?: string | null;
  source?: "manual" | "voice" | "photo";
  occurred_at?: string;
  counterparty?: string | null;
  payment_method?: PaymentMethod | null;
  due_date?: string | null;
  settled?: boolean;
}

export function useCreateTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: (payload: NewTransaction) =>
      api.post<Transaction>("/transactions", payload),
    onSuccess: invalidate,
  });
}

export type TransactionEdit = Partial<
  Pick<
    NewTransaction,
    | "category_id"
    | "amount"
    | "note"
    | "occurred_at"
    | "counterparty"
    | "payment_method"
    | "due_date"
  >
>;

export function useUpdateTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: ({ id, ...changes }: TransactionEdit & { id: string }) =>
      api.patch<Transaction>(`/transactions/${id}`, changes),
    onSuccess: invalidate,
  });
}

export function useVoidTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Transaction>(`/transactions/${id}/void`),
    onSuccess: invalidate,
  });
}

export function useSettleTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: ({ id, settled = true }: { id: string; settled?: boolean }) =>
      api.post<Transaction>(`/transactions/${id}/settle?settled=${settled}`),
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; type: EntryType }) =>
      api.post<Category>("/categories", payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...changes
    }: {
      id: string;
      name?: string;
      archived?: boolean;
    }) => api.patch<Category>(`/categories/${id}`, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      // A rename changes the label on every row and every breakdown line.
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}
