import type { Business } from "@/lib/types";

/**
 * Everything about what this costs and how to pay for it, in one place.
 *
 * Payment is collected by hand, so these are build-time settings rather than anything
 * the app queries. Set them in `.env` at deploy time; the defaults are deliberately
 * generic so an unconfigured build says "get in touch" instead of inventing a bank
 * account number.
 */
export const BILLING = {
  price: import.meta.env.VITE_PRICE_MONTHLY ?? "LKR 1,500",
  cadence: "per shop, per month",
  trialDays: 30,
  bankName: import.meta.env.VITE_PAY_BANK ?? "",
  accountName: import.meta.env.VITE_PAY_ACCOUNT_NAME ?? "",
  accountNumber: import.meta.env.VITE_PAY_ACCOUNT_NUMBER ?? "",
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL ?? "hello@glauxledger.lk",
} as const;

export const hasBankDetails = Boolean(
  BILLING.bankName && BILLING.accountNumber,
);

/** Below this, the countdown is worth interrupting someone's day with. Above it, not. */
export const TRIAL_WARNING_DAYS = 7;

export function shouldWarn(business: Business | null): boolean {
  if (!business) return false;
  if (business.status === "lapsed") return true;
  return (
    business.status === "trialing" &&
    business.trial_days_left <= TRIAL_WARNING_DAYS
  );
}

export function daysLeftLabel(days: number): string {
  if (days <= 0) return "Last day of your trial";
  if (days === 1) return "1 day left in your trial";
  return `${days} days left in your trial`;
}

export { formatDate as formatDay } from "@/lib/format";
