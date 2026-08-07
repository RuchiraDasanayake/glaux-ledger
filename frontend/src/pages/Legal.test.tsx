import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Privacy, Terms } from "@/pages/Legal";
import { renderApp } from "@/test/render";

/**
 * These are promises, not decoration, so what is tested is that the promises are on the
 * page and that both documents are reachable from either side of the sign-in wall. The
 * prose itself will change; the four commitments below are the ones a shop decides on.
 */
describe("the privacy policy", () => {
  it("says the recordings and photos are not kept", () => {
    renderApp(<Privacy />);
    expect(
      screen.getByText(/No voice clips and no receipt photographs/),
    ).toBeInTheDocument();
  });

  it("discloses that payment slips are stored for staff review", () => {
    renderApp(<Privacy />);
    expect(
      screen.getByRole("heading", { name: "Payment slips" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/stored privately in our database/i),
    ).toBeInTheDocument();
  });

  it("names the law the rights come from", () => {
    renderApp(<Privacy />);
    expect(
      screen.getByText(/Personal Data Protection Act/),
    ).toBeInTheDocument();
  });

  it("gives an address to ask at", () => {
    renderApp(<Privacy />);
    expect(screen.getAllByRole("link", { name: /@/ }).length).toBeGreaterThan(
      0,
    );
  });
});

describe("the terms", () => {
  it("promise that a lapsed shop can still read and export", () => {
    renderApp(<Terms />);
    const section = screen.getByRole("heading", { name: "If you stop paying" })
      .parentElement as HTMLElement;
    expect(
      within(section).getByText(
        /Reading, searching and exporting to PDF keep working/,
      ),
    ).toBeInTheDocument();
  });

  it("state the trial length and the price together", () => {
    renderApp(<Terms />);
    expect(screen.getByText(/30 days free/)).toBeInTheDocument();
    expect(screen.getByText(/per shop, per month/)).toBeInTheDocument();
  });
});

describe("the contents list", () => {
  it("points at headings that are actually on the page", () => {
    const { container } = renderApp(<Terms />);
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        'nav[aria-label="Contents"] a',
      ),
    );

    expect(links.length).toBeGreaterThan(3);
    for (const link of links) {
      // The anchors are derived from the headings, so a heading reworded without the
      // derivation keeping up leaves a link that scrolls nowhere.
      const id = link.getAttribute("href")?.slice(1) ?? "";
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});

describe("either document", () => {
  it("sits inside the app for a shop that is signed in", () => {
    renderApp(<Terms />);
    // The shell supplies the way back, so the standalone header must not appear.
    expect(
      screen.queryByRole("link", { name: "Start free" }),
    ).not.toBeInTheDocument();
  });

  it("stands on its own for a stranger, with a way back to the product", () => {
    renderApp(<Privacy />, {
      auth: { status: "anonymous", business: null, email: null },
    });
    expect(screen.getByRole("link", { name: "Glaux Ledger" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Start free" }),
    ).toBeInTheDocument();
  });
});
