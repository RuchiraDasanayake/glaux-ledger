import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext } from "@/lib/admin-auth-context";
import type { AdminOverview } from "@/lib/types";
import { AdminOverview as OverviewPage } from "@/pages/admin/AdminOverview";

const overview: AdminOverview = {
  shops_total: 12,
  shops_trialing: 3,
  shops_active: 7,
  shops_lapsed: 2,
  shops_suspended: 0,
  pending_payments: 4,
  shops_joined_7d: 1,
};

function renderOverview(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminAuthContext.Provider
          value={{
            user: {
              id: "a1",
              email: "ops@glauxledger.lk",
              role: "admin",
            },
            status: "authenticated",
            signIn: async () => {},
            signOut: () => {},
          }}
        >
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </AdminAuthContext.Provider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Providers });
}

describe("admin overview", () => {
  beforeEach(() => {
    localStorage.setItem("glaux.admin.token", "test-admin-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/admin/overview") {
          return new Response(JSON.stringify(overview), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ detail: "missing" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  it("shows shop metrics and next moves", async () => {
    renderOverview(<OverviewPage />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("On trial")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Slips waiting")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Review payment slips/i }),
    ).toHaveAttribute("href", "/admin/payments");
    expect(
      screen.getByRole("link", { name: /Chase lapsed shops/i }),
    ).toHaveAttribute("href", "/admin/shops?status=lapsed");
  });
});
