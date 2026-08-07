import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Settings } from "@/pages/Settings";
import { renderApp, SHOP } from "@/test/render";
import { stubApi, type FakeApi } from "@/test/server";
import type { PaymentSubmission } from "@/lib/types";

function aSubmission(
  overrides: Partial<PaymentSubmission> = {},
): PaymentSubmission {
  return {
    id: "ps1",
    status: "pending",
    amount: "1500.00",
    transfer_date: "2026-08-05",
    transfer_reference: "Nimal Stationers",
    evidence_mime: "image/jpeg",
    evidence_size: 120_000,
    created_at: "2026-08-05T10:00:00Z",
    reviewed_at: null,
    review_note: null,
    ...overrides,
  };
}

describe("billing in settings", () => {
  let api: FakeApi;

  beforeEach(() => {
    api = stubApi();
    api.on("/categories", () => []);
    api.on("/recurring", () => []);
    api.on("/billing/payment-submissions", () => []);
  });

  it("shows three payment steps and keeps upload available when lapsed", async () => {
    renderApp(<Settings />, {
      auth: {
        business: { ...SHOP, status: "lapsed", paid_through: "2026-07-01" },
      },
      route: "/settings",
    });

    expect(
      await screen.findByRole("heading", { name: "How to pay" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Copy the bank details/i)).toBeInTheDocument();
    expect(screen.getByText(/Make the transfer/i)).toBeInTheDocument();
    expect(screen.getByText(/Submit the bank slip/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload payment proof" }),
    ).toBeEnabled();
  });

  it("renders calm status history for pending, approved, and rejected", async () => {
    api.on("/billing/payment-submissions", () => [
      aSubmission({ id: "a", status: "pending" }),
      aSubmission({
        id: "b",
        status: "approved",
        reviewed_at: "2026-08-06T12:00:00Z",
      }),
      aSubmission({
        id: "c",
        status: "rejected",
        review_note: "Amount did not match the transfer.",
        reviewed_at: "2026-08-06T13:00:00Z",
      }),
    ]);

    renderApp(<Settings />, { route: "/settings" });

    expect(await screen.findByText("Under review")).toBeInTheDocument();
    expect(screen.getByText("Payment applied")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(
      screen.getByText(/Amount did not match the transfer/),
    ).toBeInTheDocument();
  });

  it("opens the upload sheet with privacy copy", async () => {
    const user = userEvent.setup();
    renderApp(<Settings />, { route: "/settings" });

    await user.click(
      await screen.findByRole("button", { name: "Upload payment proof" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Submit payment proof",
    });
    expect(
      within(dialog).getByText(/stored privately so staff can confirm/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Submit for review" }),
    ).toBeInTheDocument();
  });
});
