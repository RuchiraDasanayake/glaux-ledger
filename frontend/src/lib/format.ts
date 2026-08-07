/**
 * Amounts arrive as decimal strings so NUMERIC(12,2) is never round-tripped through a
 * float. They are only converted to a number at the moment of display.
 */

/**
 * A Sri Lankan shopkeeper writes 3 Aug 2026, reads the clock as 7:56 PM, and counts in
 * thousands rather than lakhs. No single locale gives all three: en-LK orders dates
 * month-first, en-GB puts the clock on 24 hours, and en-IN groups digits in lakhs. So
 * each is picked for the one thing it gets right, and named so the next person does not
 * "tidy" them into agreement.
 */
const DATE_LOCALE = "en-GB";
const CLOCK_LOCALE = "en-LK";
const NUMBER_LOCALE = "en-LK";

/** Symbol and figure kept apart so the display can size them differently. */
export function formatAmountParts(
  value: string | number,
  currency = "LKR",
): { symbol: string; figure: string } {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return { symbol: "", figure: "-" };

  // Shop amounts are usually whole rupees; trailing ".00" is noise on a small screen.
  const hasFraction = Math.abs(amount % 1) > 0.001;
  return {
    symbol: currencySymbol(currency),
    figure: amount.toLocaleString(NUMBER_LOCALE, {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }),
  };
}

export function formatAmount(value: string | number, currency = "LKR"): string {
  const { symbol, figure } = formatAmountParts(value, currency);
  return symbol ? `${symbol} ${figure}` : figure;
}

/** Prefixed so income and expense are distinguishable without relying on colour. */
export function formatSigned(
  value: string | number,
  type: "income" | "expense",
  currency = "LKR",
) {
  return `${type === "income" ? "+" : "−"} ${formatAmount(value, currency)}`;
}

function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "LKR":
      return "Rs";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "INR":
      return "₹";
    default:
      return currency.toUpperCase();
  }
}

export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString(CLOCK_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatDayLabel(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
}

/**
 * A plain YYYY-MM-DD, formatted without shifting it into another zone.
 *
 * `new Date("2026-08-02")` is midnight UTC, which is still 1 August in Colombo and in
 * every zone west of it. The day the server calculated is already the shop's own, so
 * it is parsed as local time and left alone.
 */
export function formatPlainDay(
  day: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(DATE_LOCALE, options);
}

/** A full date, for anything dated rather than scheduled: a trial end, a paid-through. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALE, { dateStyle: "medium" });
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const from = new Date(start).toLocaleDateString(DATE_LOCALE, {
    day: "numeric",
    month: "short",
  });
  return `${from} to ${formatDate(end)}`;
}

/** Today in the shop's timezone, as YYYY-MM-DD, for date inputs.
 *
 * en-CA regardless of the locale above, because this one is not for reading: a date
 * input's value attribute is ISO or it is nothing.
 */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
