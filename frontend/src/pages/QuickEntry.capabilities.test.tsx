import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QuickEntry } from "@/pages/QuickEntry";
import { renderApp } from "@/test/render";
import { aPage, stubApi, type FakeApi } from "@/test/server";

describe("AI capture gating on quick entry", () => {
  let api: FakeApi;

  beforeEach(() => {
    api = stubApi();
    api.on("/transactions/summary", () => ({
      period: "day",
      start_date: "2026-08-07",
      end_date: "2026-08-07",
      timezone: "Asia/Colombo",
      currency: "LKR",
      income: "0",
      expense: "0",
      net: "0",
      by_category: [],
      previous_net: "0",
      outstanding_payable: "0",
      outstanding_receivable: "0",
      overdue_count: 0,
    }));
    api.on("/transactions", () => aPage([]));
    api.on("/recurring", () => []);
  });

  it("hides voice and photo when AI capture is disabled", async () => {
    api.on("/capabilities", () => ({ ai_parsing_enabled: false }));

    renderApp(<QuickEntry />);

    expect(
      await screen.findByRole("button", { name: /Type it/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Record voice/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Take photo/i }),
    ).not.toBeInTheDocument();
  });

  it("shows voice and photo when AI capture is enabled", async () => {
    api.on("/capabilities", () => ({ ai_parsing_enabled: true }));

    renderApp(<QuickEntry />);

    expect(
      await screen.findByRole("button", { name: /Record voice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Take photo/i }),
    ).toBeInTheDocument();
  });
});
