import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { History } from "@/pages/History";
import { renderApp } from "@/test/render";
import {
  aCategory,
  aPage,
  aTransaction,
  stubApi,
  type FakeApi,
} from "@/test/server";

const ENTRIES = [
  aTransaction({ note: "20 pages colour", category: aCategory() }),
  aTransaction({
    note: "Electricity, August",
    counterparty: "CEB",
    entry_type: "expense",
    amount: "6450.00",
    category: aCategory({ id: "c2", name: "Utilities", type: "expense" }),
  }),
];

let api: FakeApi;

beforeEach(() => {
  api = stubApi();
  api.on("/categories", () => [ENTRIES[0].category, ENTRIES[1].category]);
  api.on("/transactions", (params) => {
    const query = params.get("q")?.toLowerCase();
    if (!query) return aPage(ENTRIES);
    return aPage(
      ENTRIES.filter((entry) =>
        `${entry.note} ${entry.counterparty} ${entry.category.name}`
          .toLowerCase()
          .includes(query),
      ),
    );
  });
});

afterEach(() => vi.unstubAllGlobals());

function lastQuery(): string | null {
  const transactionCalls = api.calls.filter(
    (call) => call.path === "/transactions",
  );
  return transactionCalls.at(-1)?.params.get("q") ?? null;
}

describe("History search", () => {
  it("sends what was typed to the server, not a client-side filter", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("Electricity, August", { exact: false });

    await user.type(
      screen.getByRole("searchbox", { name: /search entries/i }),
      "ceb",
    );

    await waitFor(() => expect(lastQuery()).toBe("ceb"));
  });

  it("waits for a pause before asking, rather than once per keystroke", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("Electricity, August", { exact: false });
    const before = api.calls.filter(
      (call) => call.path === "/transactions",
    ).length;

    await user.type(
      screen.getByRole("searchbox", { name: /search entries/i }),
      "ceb",
    );
    await waitFor(() => expect(lastQuery()).toBe("ceb"));

    const after = api.calls.filter(
      (call) => call.path === "/transactions",
    ).length;
    // One request for the settled term, not one per letter.
    expect(after - before).toBeLessThanOrEqual(2);
  });

  it("narrows the list to what matched", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("20 pages colour", { exact: false });

    await user.type(
      screen.getByRole("searchbox", { name: /search entries/i }),
      "ceb",
    );

    await waitFor(() =>
      expect(
        screen.queryByText("20 pages colour", { exact: false }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Electricity, August", { exact: false }),
    ).toBeInTheDocument();
  });

  it("names the term it found nothing for", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("20 pages colour", { exact: false });

    await user.type(
      screen.getByRole("searchbox", { name: /search entries/i }),
      "kerosene",
    );

    expect(
      await screen.findByText(/Nothing matches .kerosene./),
    ).toBeInTheDocument();
  });

  it("is undone by Clear filters along with everything else", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("20 pages colour", { exact: false });
    const field = screen.getByRole("searchbox", { name: /search entries/i });

    await user.type(field, "ceb");
    await waitFor(() => expect(lastQuery()).toBe("ceb"));
    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(field).toHaveValue("");
    await waitFor(() => expect(lastQuery()).toBeNull());
  });

  it("leaves Clear filters inert until there is something to clear", async () => {
    renderApp(<History />);
    await screen.findByText("20 pages colour", { exact: false });

    expect(
      screen.getByRole("button", { name: /clear filters/i }),
    ).toBeDisabled();
  });
});

/**
 * The structured filters fold away below lg, which is a stylesheet's job and invisible
 * here. What is worth pinning is the part that would strand someone: folded away, the
 * toggle has to carry the fact that a filter is on, or a list cut to three rows looks
 * like a shop that had a quiet month.
 */
describe("History filters when folded", () => {
  const toggle = () => screen.getByRole("button", { name: /^filters/i });

  it("counts what is set behind it", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("20 pages colour", { exact: false });

    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: /unpaid only/i }));

    expect(
      screen.getByRole("button", { name: "Filters, 1 set" }),
    ).toBeInTheDocument();
  });

  it("opens and closes", async () => {
    const user = userEvent.setup();
    renderApp(<History />);
    await screen.findByText("20 pages colour", { exact: false });

    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });
});
