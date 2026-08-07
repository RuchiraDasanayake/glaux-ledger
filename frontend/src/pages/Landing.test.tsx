import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "@/pages/Landing";
import { renderApp } from "@/test/render";

const anonymous = {
  auth: { status: "anonymous" as const, business: null, email: null },
};

/**
 * The landing page is mostly prose and will be rewritten whenever the pitch changes, so
 * there is nothing to gain from asserting its sentences. What is worth holding is the
 * part that is structural: a stranger can always get to a trial or to sign-in, and the
 * demo ledger never presents itself as the reader's own figures.
 */
describe("the landing page", () => {
  it("offers a way to start from every screenful", () => {
    renderApp(<Landing />, anonymous);

    const starts = screen.getAllByRole("link", {
      name: /free days|Start free/,
    });
    // Header, hero, pricing and the closing band. Someone who scrolls past one should
    // not have to scroll back for it.
    expect(starts.length).toBeGreaterThan(2);
    for (const link of starts) {
      expect(link).toHaveAttribute("href", "/register");
    }
  });

  it("keeps a way back in for a shop that already exists", () => {
    renderApp(<Landing />, anonymous);
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("hides the demo ledger from assistive tech", () => {
    renderApp(<Landing />, anonymous);

    // Invented figures read out in the same breath as real ones would be worse than no
    // illustration at all. The card is decoration, and its shop name is the marker for
    // finding it without depending on any of the numbers, which change as it runs.
    const inside = screen.getByText("Nimal Stationers");
    expect(inside.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
