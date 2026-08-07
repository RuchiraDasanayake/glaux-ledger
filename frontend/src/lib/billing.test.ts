import { describe, expect, it } from "vitest";
import { daysLeftLabel, shouldWarn, TRIAL_WARNING_DAYS } from "@/lib/billing";
import type { Business, SubscriptionStatus } from "@/lib/types";

function business(status: SubscriptionStatus, trialDaysLeft: number): Business {
  return {
    id: "b1",
    name: "Nimal Stationers",
    currency: "LKR",
    timezone: "Asia/Colombo",
    status,
    trial_ends_at: "2026-09-01T00:00:00Z",
    trial_days_left: trialDaysLeft,
    paid_through: null,
  };
}

describe("shouldWarn", () => {
  it("says nothing for most of the trial", () => {
    expect(shouldWarn(business("trialing", TRIAL_WARNING_DAYS + 1))).toBe(
      false,
    );
  });

  it("speaks up in the last week", () => {
    expect(shouldWarn(business("trialing", TRIAL_WARNING_DAYS))).toBe(true);
    expect(shouldWarn(business("trialing", 0))).toBe(true);
  });

  it("stays quiet for a paying shop", () => {
    expect(shouldWarn(business("active", 0))).toBe(false);
  });

  it("always speaks up for a lapsed one", () => {
    expect(shouldWarn(business("lapsed", 0))).toBe(true);
  });

  it("says nothing before a session exists", () => {
    expect(shouldWarn(null)).toBe(false);
  });
});

describe("daysLeftLabel", () => {
  it("counts in whole days and gets the singular right", () => {
    expect(daysLeftLabel(5)).toBe("5 days left in your trial");
    expect(daysLeftLabel(1)).toBe("1 day left in your trial");
  });

  it("never says zero or a negative number of days", () => {
    expect(daysLeftLabel(0)).toBe("Last day of your trial");
    expect(daysLeftLabel(-3)).toBe("Last day of your trial");
  });
});
