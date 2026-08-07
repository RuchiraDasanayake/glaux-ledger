import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayInZone } from "@/lib/format";
import { Export } from "@/pages/Export";
import { renderApp, SHOP } from "@/test/render";
import { stubApi, type FakeApi } from "@/test/server";

/**
 * The preview exists so nobody downloads a PDF to find out the dates were wrong, which
 * makes the range it asks the server for the part worth pinning down: a preview showing
 * the right figures for the wrong span is worse than no preview at all.
 *
 * Dates are derived from the shop's today rather than frozen. Fake timers around React
 * Query buy a brittle test, and the arithmetic under test is "today minus six", which a
 * hardcoded date would restate rather than check.
 */

let api: FakeApi;

const TODAY = todayInZone(SHOP.timezone);

function shift(days: number): string {
  const [year, month, day] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

const TOTALS = {
  period: "custom",
  start_date: shift(-29),
  end_date: TODAY,
  timezone: SHOP.timezone,
  currency: "LKR",
  income: "87540.00",
  expense: "85860.00",
  net: "1680.00",
  previous_net: "0.00",
  outstanding_payable: "24450.00",
  outstanding_receivable: "0.00",
  overdue_count: 1,
  by_category: [
    {
      category_id: "c1",
      category_name: "Printing",
      entry_type: "income",
      total: "49800.00",
      count: 12,
    },
    {
      category_id: "c2",
      category_name: "Stock & Supplies",
      entry_type: "expense",
      total: "42260.00",
      count: 4,
    },
  ],
};

beforeEach(() => {
  api = stubApi();
  api.on("/transactions/summary", () => TOTALS);
});

afterEach(() => vi.unstubAllGlobals());

/** An amount's digits are split across spans for comma kerning, so read the whole cell. */
function figure(label: string): string {
  const term = screen.getByText(label, { selector: "dt" });
  return term.parentElement?.textContent ?? "";
}

function lastRange(): string {
  const asked = api.calls.filter(
    (call) => call.path === "/transactions/summary",
  );
  const params = asked.at(-1)?.params;
  return `${params?.get("from_date")}..${params?.get("to_date")}`;
}

describe("Export preview", () => {
  it("shows the figures the report will carry", async () => {
    renderApp(<Export />);
    await screen.findByText("Still owed");

    expect(figure("In")).toContain("87,540");
    expect(figure("Out")).toContain("85,860");
    expect(figure("Net")).toContain("1,680");
    expect(figure("Still owed")).toContain("24,450");
    expect(screen.getByText("1 overdue")).toBeInTheDocument();
    expect(screen.getByText("Stock & Supplies")).toBeInTheDocument();
  });

  /**
   * The breakdown used to be one list wrapped into columns, which under an In | Out band
   * read as a split it did not have: a cost landing in the left column looked filed under
   * income. The columns are the split now, so pin a cost to the right one.
   */
  it("keeps costs out of the money-in column", async () => {
    renderApp(<Export />);
    await screen.findByText("Still owed");

    const group = (title: string) =>
      within(screen.getByRole("heading", { name: title }).parentElement!);

    expect(group("Money in").getByText("Printing")).toBeInTheDocument();
    expect(group("Money in").queryByText("Stock & Supplies")).toBeNull();
    expect(
      group("Money out").getByText("Stock & Supplies"),
    ).toBeInTheDocument();
  });

  it("asks for the range the form is showing, not a named period", async () => {
    renderApp(<Export />);

    await waitFor(() => expect(lastRange()).toBe(`${shift(-29)}..${TODAY}`));
  });

  it("follows the preset that was chosen", async () => {
    const user = userEvent.setup();
    renderApp(<Export />);
    await screen.findByText("Still owed");

    await user.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() => expect(lastRange()).toBe(`${shift(-6)}..${TODAY}`));
  });

  it("does not ask the server for a backwards range", async () => {
    renderApp(<Export />);
    await screen.findByText("Still owed");
    const asked = api.calls.length;

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: shift(1) },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /end date is before the start date/i,
    );
    expect(api.calls.length).toBe(asked);
  });

  it("says so rather than presenting an empty report as a result", async () => {
    api.on("/transactions/summary", () => ({
      ...TOTALS,
      income: "0.00",
      expense: "0.00",
      net: "0.00",
      by_category: [],
    }));
    renderApp(<Export />);

    expect(
      await screen.findByText(/Nothing was recorded in this range/),
    ).toBeInTheDocument();
  });
});
