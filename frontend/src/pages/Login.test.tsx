import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { NewShop } from "@/lib/auth-context";
import { Login } from "@/pages/Login";
import { renderApp } from "@/test/render";

const ANONYMOUS = { status: "anonymous", business: null, email: null } as const;

describe("the sign-in screen", () => {
  it("sends the wordmark home at every width", () => {
    renderApp(<Login />, { auth: ANONYMOUS });

    // Two of them: the heading below the `lg` breakpoint and the one in the brand
    // panel above it. Only one is ever displayed, and both have to go somewhere.
    const marks = screen.getAllByRole("link", { name: "Glaux Ledger" });
    expect(marks).toHaveLength(2);
    for (const mark of marks) expect(mark).toHaveAttribute("href", "/");
  });
});

/**
 * Registration is the one form in the product where a mistake cannot be undone by trying
 * again: there is no password reset, and currency and timezone are fixed for the life of
 * the shop. All three of these guard that.
 */
describe("creating a shop", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Shop name"), "Nimal Stationers");
    await user.type(screen.getByLabelText("Email"), "nimal@example.com");
    await user.type(screen.getByLabelText("Password"), "counter-book-1");
  }

  it("will not create the shop on two different passwords", async () => {
    const user = userEvent.setup();
    const register = vi.fn<(shop: NewShop) => Promise<void>>();
    renderApp(<Login initialMode="register" />, {
      auth: { ...ANONYMOUS, register },
    });

    await fill(user);
    await user.type(
      screen.getByLabelText("Confirm password"),
      "counter-book-2",
    );
    await user.click(screen.getByRole("button", { name: "Create shop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not the same/i);
    expect(register).not.toHaveBeenCalled();
  });

  it("says so at the field before the button is pressed", async () => {
    const user = userEvent.setup();
    renderApp(<Login initialMode="register" />, { auth: ANONYMOUS });

    await user.type(screen.getByLabelText("Password"), "counter-book-1");
    const confirm = screen.getByLabelText("Confirm password");
    await user.type(confirm, "counter-book-2");

    expect(confirm).toHaveAttribute("aria-invalid", "true");
  });

  it("carries the currency and timezone the shop chose", async () => {
    const user = userEvent.setup();
    const register = vi.fn<(shop: NewShop) => Promise<void>>();
    renderApp(<Login initialMode="register" />, {
      auth: { ...ANONYMOUS, register },
    });

    await fill(user);
    await user.type(
      screen.getByLabelText("Confirm password"),
      "counter-book-1",
    );
    await user.selectOptions(screen.getByLabelText("Currency"), "GBP");
    await user.selectOptions(
      screen.getByLabelText("Timezone"),
      "Europe/London",
    );
    await user.click(screen.getByRole("button", { name: "Create shop" }));

    // Defaulting these quietly would hand a London shop a book denominated in rupees
    // with its days ending at 6:30pm, and neither is editable afterwards.
    expect(register).toHaveBeenCalledWith({
      businessName: "Nimal Stationers",
      email: "nimal@example.com",
      password: "counter-book-1",
      currency: "GBP",
      timezone: "Europe/London",
    });
  });
});
