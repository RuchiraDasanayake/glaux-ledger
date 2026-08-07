import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod, RecurringBill, Transaction } from "@/lib/types";

export interface NewRecurringBill {
  category_id: string;
  name: string;
  amount: string;
  day_of_month: number;
  counterparty?: string | null;
  payment_method?: PaymentMethod | null;
  note?: string | null;
}

export type RecurringEdit = Partial<NewRecurringBill> & { active?: boolean };

/**
 * Recording a bill writes a transaction, so everything that reads transactions has to
 * be told. Shared with the ledger's own invalidation for exactly that reason.
 */
function useRecurringInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["daily"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["counterparties"] });
  };
}

export function useRecurringBills(includePaused = true) {
  return useQuery({
    queryKey: ["recurring", includePaused],
    queryFn: () =>
      api.get<RecurringBill[]>(
        `/recurring${includePaused ? "" : "?include_paused=false"}`,
      ),
    // Whether a bill is due turns over at midnight in the shop's timezone, which no
    // client-side timer here is going to catch reliably. A minute of staleness on a
    // monthly reminder costs nothing.
    staleTime: 60 * 1000,
  });
}

export function useCreateRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: (payload: NewRecurringBill) =>
      api.post<RecurringBill>("/recurring", payload),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: ({ id, ...changes }: RecurringEdit & { id: string }) =>
      api.patch<RecurringBill>(`/recurring/${id}`, changes),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.remove<void>(`/recurring/${id}`),
    onSuccess: invalidate,
  });
}

export function useRecordRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      settled = true,
    }: {
      id: string;
      amount?: string;
      settled?: boolean;
    }) => api.post<Transaction>(`/recurring/${id}/record`, { amount, settled }),
    onSuccess: invalidate,
  });
}
