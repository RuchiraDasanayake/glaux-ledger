import { describe, expect, it } from "vitest";
import { isAllowedSlip } from "@/hooks/usePayments";

describe("payment slip file checks", () => {
  it("accepts JPEG, PNG, and PDF", () => {
    expect(
      isAllowedSlip(new File([""], "slip.jpg", { type: "image/jpeg" })),
    ).toBe(true);
    expect(
      isAllowedSlip(new File([""], "slip.png", { type: "image/png" })),
    ).toBe(true);
    expect(
      isAllowedSlip(new File([""], "slip.pdf", { type: "application/pdf" })),
    ).toBe(true);
  });

  it("rejects other types even when the extension looks wrong", () => {
    expect(
      isAllowedSlip(new File([""], "notes.txt", { type: "text/plain" })),
    ).toBe(false);
  });

  it("falls back to the extension when the browser leaves type empty", () => {
    expect(isAllowedSlip(new File([""], "slip.JPEG", { type: "" }))).toBe(
      true,
    );
    expect(isAllowedSlip(new File([""], "slip.webp", { type: "" }))).toBe(
      false,
    );
  });
});
