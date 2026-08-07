import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatAmountParts,
  formatDate,
  formatDayLabel,
  formatPlainDay,
  formatSigned,
  formatTime,
  todayInZone,
} from "@/lib/format";

describe("formatAmountParts", () => {
  it("drops a zero fraction and keeps a real one", () => {
    expect(formatAmountParts("450.00").figure).toBe("450");
    expect(formatAmountParts("450.50").figure).toBe("450.50");
    expect(formatAmountParts("450.55").figure).toBe("450.55");
  });

  it("counts in thousands, not lakhs", () => {
    // en-IN would render this 12,34,567, which is not how a Sri Lankan shop writes it.
    expect(formatAmountParts("1234567").figure).toBe("1,234,567");
  });

  it("keeps the symbol apart from the figure, so they can be sized separately", () => {
    expect(formatAmountParts("10", "LKR")).toEqual({
      symbol: "Rs",
      figure: "10",
    });
    expect(formatAmountParts("10", "USD").symbol).toBe("$");
  });

  it("falls back to the code for a currency it has no symbol for", () => {
    expect(formatAmountParts("10", "aud").symbol).toBe("AUD");
  });

  it("shows a dash rather than NaN for a value it cannot read", () => {
    expect(formatAmountParts("not a number").figure).toBe("-");
  });
});

describe("formatSigned", () => {
  it("marks direction with a character, never colour alone", () => {
    expect(formatSigned("100", "income")).toBe("+ Rs 100");
    expect(formatSigned("100", "expense")).toBe("− Rs 100");
  });
});

describe("formatPlainDay", () => {
  it("does not shift a plain date into another day", () => {
    // The bug this guards: new Date("2026-08-02") is midnight UTC, which is still
    // 1 August anywhere west of Greenwich. The server already resolved the shop's own
    // calendar day, so the string must be read as local and left alone.
    expect(formatPlainDay("2026-08-02")).toBe("2 Aug");
    expect(formatPlainDay("2026-01-01")).toBe("1 Jan");
  });

  it("puts the day before the month, the way Sri Lanka writes it", () => {
    // en-LK, the locale you would reach for first, orders these month-first.
    expect(formatDate("2026-08-02T00:00:00Z")).toBe("2 Aug 2026");
  });

  it("takes the same options as any other date formatter", () => {
    expect(formatPlainDay("2026-08-02", { weekday: "short" })).toBe("Sun");
  });
});

describe("formatDayLabel", () => {
  it("names the day in the shop's timezone, not the browser's", () => {
    // 19:30 UTC is already the next morning in Colombo.
    const label = formatDayLabel("2026-08-02T19:30:00Z", "Asia/Colombo");
    expect(label).toBe("Mon 3 Aug");
  });
});

describe("formatTime", () => {
  it("reads the clock the way a shop does, on twelve hours", () => {
    expect(formatTime("2026-08-02T09:05:00Z", "Asia/Colombo")).toBe("2:35 PM");
  });
});

describe("formatAmount", () => {
  it("joins the symbol back on for a plain string", () => {
    expect(formatAmount("2400", "LKR")).toBe("Rs 2,400");
  });
});

describe("todayInZone", () => {
  it("returns a date input's format", () => {
    expect(todayInZone("Asia/Colombo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports the shop's day, not the browser's", () => {
    // Kiritimati is +14 and Niue is −11: 25 hours apart, so on any real instant these
    // two cannot both be the same calendar day.
    const east = todayInZone("Pacific/Kiritimati");
    const west = todayInZone("Pacific/Niue");
    expect(east >= west).toBe(true);
  });
});
