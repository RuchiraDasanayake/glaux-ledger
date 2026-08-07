import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthContext } from "@/lib/admin-auth-context";
import { ToastContext } from "@/lib/toast-context";
import type { AdminPaymentSubmission } from "@/lib/types";
import { AdminPayments } from "@/pages/admin/AdminPayments";

function aAdminRow(
  overrides: Partial<AdminPaymentSubmission> = {},
): AdminPaymentSubmission {
  return {
    id: "ps1",
    business_id: "b1",
    business_name: "Nimal Stationers",
    owner_email: "nimal@example.com",
    reviewed_by: null,
    status: "pending",
    amount: "1500.00",
    transfer_date: "2026-08-05",
    transfer_reference: "Nimal Stationers",
    evidence_mime: "image/jpeg",
    evidence_size: 80_000,
    created_at: "2026-08-05T10:00:00Z",
    reviewed_at: null,
    review_note: null,
    ...overrides,
  };
}

function renderAdmin(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={["/admin/payments"]}>
        <AdminAuthContext.Provider
          value={{
            user: {
              id: "a1",
              email: "ops@glauxledger.lk",
              role: "reviewer",
            },
            status: "authenticated",
            signIn: async () => {},
            signOut: () => {},
          }}
        >
          <ToastContext.Provider value={() => {}}>
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
          </ToastContext.Provider>
        </AdminAuthContext.Provider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Providers });
}

describe("admin payment review", () => {
  beforeEach(() => {
    localStorage.setItem("glaux.admin.token", "test-admin-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/admin/payment-submissions") {
          return new Response(JSON.stringify([aAdminRow()]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname.endsWith("/evidence")) {
          return new Response(
            new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
              type: "image/jpeg",
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ detail: `No stub for ${url.pathname}` }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  it("lists pending slips and opens a review sheet", async () => {
    const user = userEvent.setup();
    renderAdmin(<AdminPayments />);

    expect(await screen.findByText("Nimal Stationers")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Nimal Stationers/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Evidence")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Approve…" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Reject…" }),
    ).toBeInTheDocument();
  });

  it("requires a rejection reason before confirming", async () => {
    const user = userEvent.setup();
    renderAdmin(<AdminPayments />);

    await user.click(
      await screen.findByRole("button", { name: /Nimal Stationers/i }),
    );
    await user.click(await screen.findByRole("button", { name: "Reject…" }));
    await user.click(screen.getByRole("button", { name: "Confirm reject" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /rejection reason is required/i,
    );
  });
});
