import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, fetchAdminEvidence } from "@/lib/admin-api";
import type {
  AdminPaymentSubmission,
  PaymentReview,
  PaymentSubmissionStatus,
} from "@/lib/types";

export type AdminPaymentFilter = PaymentSubmissionStatus | "all";

export function useAdminPaymentSubmissions(status: AdminPaymentFilter) {
  const query =
    status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  return useQuery({
    queryKey: ["admin-payment-submissions", status],
    queryFn: ({ signal }) =>
      adminApi.get<AdminPaymentSubmission[]>(
        `/admin/payment-submissions${query}`,
        signal,
      ),
  });
}

export function useApprovePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, months }: { id: string; months: number }) =>
      adminApi.post<PaymentReview>(
        `/admin/payment-submissions/${id}/approve`,
        { months },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-payment-submissions"],
      });
    },
  });
}

export function useRejectPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.post<PaymentReview>(
        `/admin/payment-submissions/${id}/reject`,
        { note: reason },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-payment-submissions"],
      });
    },
  });
}

export function useAdminEvidence(id: string | null) {
  return useQuery({
    queryKey: ["admin-payment-evidence", id],
    queryFn: () => fetchAdminEvidence(id!),
    enabled: Boolean(id),
    staleTime: 0,
    gcTime: 0,
  });
}
