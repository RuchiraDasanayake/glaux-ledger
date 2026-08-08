import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import type { AdminOverview, AdminShop, SubscriptionStatus } from "@/lib/types";

export type AdminShopFilter = SubscriptionStatus | "suspended" | "all";

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin-overview"],
    queryFn: ({ signal }) => adminApi.get<AdminOverview>("/admin/overview", signal),
  });
}

export function useAdminShops(filter: AdminShopFilter, q: string) {
  const params = new URLSearchParams();
  if (filter === "suspended") params.set("suspended", "true");
  else if (filter !== "all") params.set("status", filter);
  const trimmed = q.trim();
  if (trimmed) params.set("q", trimmed);
  const query = params.toString() ? `?${params}` : "";

  return useQuery({
    queryKey: ["admin-shops", filter, trimmed],
    queryFn: ({ signal }) =>
      adminApi.get<AdminShop[]>(`/admin/shops${query}`, signal),
  });
}

export function useExtendShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, months }: { id: string; months: number }) =>
      adminApi.post<AdminShop>(`/admin/shops/${id}/extend`, { months }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

export function useSuspendShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminApi.post<AdminShop>(`/admin/shops/${id}/suspend`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

export function useUnsuspendShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminApi.post<AdminShop>(`/admin/shops/${id}/unsuspend`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}
