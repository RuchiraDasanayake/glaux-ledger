import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext } from "@/lib/admin-auth-context";
import { ToastContext } from "@/lib/toast-context";
import type { AdminOverview, AdminShop } from "@/lib/types";
import { AdminShops } from "@/pages/admin/AdminShops";

function aShop(overrides: Partial<AdminShop> = {}): AdminShop {
  return {
    id: "b1",
    name: "Nimal Stationers",
    owner_email: "nimal@example.com",
    timezone: "Asia/Colombo",
    currency: "LKR",
    status: "lapsed",
    trial_ends_at: "2026-07-01T00:00:00Z",
    trial_days_left: 0,
    paid_through: null,
    disabled_at: null,
    created_at: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

const overview: AdminOverview = {
  shops_total: 2,
  shops_trialing: 0,
  shops_active: 1,
  shops_lapsed: 1,
  shops_suspended: 0,
  pending_payments: 0,
  shops_joined_7d: 1,
};

function renderShops(ui: ReactElement, path = "/admin/shops") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const toast = vi.fn();

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
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
          <ToastContext.Provider value={toast}>
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
          </ToastContext.Provider>
        </AdminAuthContext.Provider>
      </MemoryRouter>
    );
  }

  return { ...render(ui, { wrapper: Providers }), toast };
}

describe("admin shops console", () => {
  beforeEach(() => {
    localStorage.setItem("glaux.admin.token", "test-admin-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/admin/overview") {
          return new Response(JSON.stringify(overview), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname === "/admin/shops" && (!init || init.method === "GET")) {
          return new Response(JSON.stringify([aShop()]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (
          url.pathname === "/admin/shops/b1/extend" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify(
              aShop({
                status: "active",
                paid_through: "2026-09-08",
              }),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({ detail: `No stub for ${url.pathname}` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
  });

  it("lists shops and opens the manage sheet", async () => {
    const user = userEvent.setup();
    renderShops(<AdminShops />);

    expect(await screen.findByText("Nimal Stationers")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Lapsed/i })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Nimal Stationers/i }),
    );

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("nimal@example.com")).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: /Extend paid time/i }),
    ).toBeInTheDocument();
  });

  it("extends paid time with a month preset", async () => {
    const user = userEvent.setup();
    const { toast } = renderShops(<AdminShops />);

    await user.click(
      await screen.findByRole("button", { name: /Nimal Stationers/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Extend paid time/i }),
    );
    await user.click(screen.getByRole("button", { name: "3 mo" }));
    await user.click(screen.getByRole("button", { name: /Confirm extend/i }));

    expect(toast).toHaveBeenCalledWith(
      "Extended Nimal Stationers by 3 months.",
      "success",
    );
  });
});
