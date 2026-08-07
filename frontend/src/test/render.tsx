import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext, type AuthState } from "@/lib/auth-context";
import { ToastContext, type ShowToast } from "@/lib/toast-context";
import type { Business } from "@/lib/types";

export const SHOP: Business = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Nimal Stationers",
  timezone: "Asia/Colombo",
  currency: "LKR",
  status: "active",
  trial_ends_at: "2026-09-01T00:00:00Z",
  trial_days_left: 30,
  paid_through: "2026-12-31",
};

/**
 * A signed-in shop and a fresh query cache.
 *
 * Retries off and no cache carried between tests: a component that fails to fetch
 * should fail its test in milliseconds rather than after three exponential backoffs,
 * and a client shared across tests turns test order into a dependency.
 */
export function renderApp(
  ui: ReactElement,
  {
    auth,
    route = "/",
    toast = () => {},
  }: { auth?: Partial<AuthState>; route?: string; toast?: ShowToast } = {},
): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const value: AuthState = {
    business: SHOP,
    email: "nimal@example.com",
    status: "authenticated",
    signIn: async () => {},
    register: async () => {},
    signOut: () => {},
    refresh: async () => {},
    ...auth,
  };

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={value}>
          <ToastContext.Provider value={toast}>
            <QueryClientProvider client={client}>
              {children}
            </QueryClientProvider>
          </ToastContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Providers });
}
