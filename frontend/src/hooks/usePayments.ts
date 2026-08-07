import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentSubmission } from "@/lib/types";

export const PAYMENT_SLIP_ACCEPT =
  "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";

export const PAYMENT_SLIP_MAX_BYTES = 10 * 1024 * 1024;

export function usePaymentSubmissions() {
  return useQuery({
    queryKey: ["payment-submissions"],
    queryFn: ({ signal }) =>
      api.get<PaymentSubmission[]>("/billing/payment-submissions", signal),
  });
}

export interface SubmitPaymentInput {
  file: File;
  amount: string;
  transferDate: string;
  reference: string;
}

export function useSubmitPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      amount,
      transferDate,
      reference,
    }: SubmitPaymentInput) => {
      const form = new FormData();
      form.append("evidence", file);
      form.append("amount", amount);
      form.append("transfer_date", transferDate);
      form.append("transfer_reference", reference);
      return api.upload<PaymentSubmission>(
        "/billing/payment-submissions",
        form,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payment-submissions"] });
    },
  });
}

export function isAllowedSlip(file: File): boolean {
  const type = file.type.toLowerCase();
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "application/pdf"
  ) {
    return true;
  }
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".pdf")
  );
}
