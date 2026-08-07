import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillsDue } from "@/components/BillsDue";
import type { RecurringBill } from "@/lib/types";
import { renderApp } from "@/test/render";
import { aCategory, stubApi, type FakeApi } from "@/test/server";

function aBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: "r1",
    name: "Shop rent",
    amount: "35000.00",
    day_of_month: 1,
    counterparty: "M. Perera",
    payment_method: "bank",
    note: null,
    active: true,
    category: aCategory({ id: "c3", name: "Rent", type: "expense" }),
    due_on: "2026-08-01",
    recorded_this_month: false,
    due: true,
    ...overrides,
  };
}

let api: FakeApi;

beforeEach(() => {
  api = stubApi();
});

afterEach(() => vi.unstubAllGlobals());

describe("BillsDue", () => {
  it("offers a bill whose day has arrived", async () => {
    api.on("/recurring", () => [aBill()]);
    renderApp(<BillsDue currency="LKR" />);

    expect(await screen.findByText("Shop rent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
  });

  it("stays out of the way entirely when nothing is owed", async () => {
    api.on("/recurring", () => []);
    const { container } = renderApp(<BillsDue currency="LKR" />);

    // A permanent "no bills due" panel is furniture, so the component renders nothing.
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });

  it("ignores a bill that is paused or already recorded", async () => {
    api.on("/recurring", () => [
      aBill({ id: "r2", name: "Paused bill", active: false, due: false }),
      aBill({
        id: "r3",
        name: "Done bill",
        recorded_this_month: true,
        due: false,
      }),
    ]);
    const { container } = renderApp(<BillsDue currency="LKR" />);

    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });

  it("records at the usual amount in one tap", async () => {
    const user = userEvent.setup();
    api.on("/recurring", () => [aBill()]);
    api.on("/recurring/r1/record", () => ({ id: "t1" }));
    renderApp(<BillsDue currency="LKR" />);
    await screen.findByText("Shop rent");

    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() =>
      expect(
        api.calls.some((call) => call.path === "/recurring/r1/record"),
      ).toBe(true),
    );
  });

  it("counts the bills in its heading", async () => {
    api.on("/recurring", () => [
      aBill(),
      aBill({ id: "r4", name: "Electricity", due_on: "2026-08-05" }),
    ]);
    renderApp(<BillsDue currency="LKR" />);

    expect(await screen.findByText("2 bills are due")).toBeInTheDocument();
  });

  it("asks the server for the live list only, not the paused ones", async () => {
    api.on("/recurring", () => []);
    renderApp(<BillsDue currency="LKR" />);

    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(api.calls[0].params.get("include_paused")).toBe("false");
  });
});
