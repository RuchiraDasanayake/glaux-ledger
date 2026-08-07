import { vi } from "vitest";
import type { Category, Transaction, TransactionPage } from "@/lib/types";

/**
 * A stand-in for the API, at the fetch boundary.
 *
 * Stubbing fetch rather than the `api` module keeps the request itself under test: a
 * filter that never reaches the query string is a real bug, and mocking one layer
 * higher would hide it. Each handler is keyed by pathname and receives the parsed
 * search params, so a test can assert on what was asked for as well as what came back.
 */
type Handler = (params: URLSearchParams, request: RequestInit) => unknown;

export interface FakeApi {
  /** Every request made, newest last, for asserting on what the UI asked for. */
  readonly calls: Array<{ path: string; params: URLSearchParams }>;
  on(pathname: string, handler: Handler): void;
}

export function stubApi(): FakeApi {
  const handlers = new Map<string, Handler>();
  const calls: Array<{ path: string; params: URLSearchParams }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://localhost");
      calls.push({ path: url.pathname, params: url.searchParams });

      const handler = handlers.get(url.pathname);
      if (!handler) {
        return new Response(
          JSON.stringify({ detail: `No stub for ${url.pathname}` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify(handler(url.searchParams, init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );

  return {
    calls,
    on: (pathname, handler) => handlers.set(pathname, handler),
  };
}

let nextId = 0;

export function aTransaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    amount: "450.00",
    entry_type: "income",
    note: "20 pages colour",
    source: "manual",
    created_at: "2026-08-02T04:00:00Z",
    occurred_at: "2026-08-02T04:00:00Z",
    counterparty: null,
    payment_method: "cash",
    due_date: null,
    settled_at: "2026-08-02T04:00:00Z",
    voided_at: null,
    settled: true,
    voided: false,
    category: aCategory(),
    ...overrides,
  };
}

export function aCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Printing",
    type: "income",
    archived_at: null,
    archived: false,
    ...overrides,
  };
}

export function aPage(items: Transaction[]): TransactionPage {
  return { items, total: items.length, limit: 25, offset: 0 };
}
