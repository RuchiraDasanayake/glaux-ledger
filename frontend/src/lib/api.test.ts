import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

/**
 * A 429 is the one refusal a shopkeeper is most likely to read as a broken product, since
 * they have done nothing wrong and the wait is invisible. These pin the message they get.
 */
function refuse(detail: string, retryAfter?: string) {
  const headers = new Headers();
  if (retryAfter !== undefined) headers.set("Retry-After", retryAfter);

  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ detail }), {
          status: 429,
          headers,
        }),
    ),
  );
}

async function messageFrom(): Promise<string> {
  try {
    await api.post("/auth/login", {});
    throw new Error("the call was expected to be refused");
  } catch (caught) {
    expect(caught).toBeInstanceOf(ApiError);
    return (caught as ApiError).message;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a refusal that will lift on its own", () => {
  it("says how long in seconds when the wait is short", async () => {
    refuse("Too many attempts from this connection.", "20");
    expect(await messageFrom()).toBe(
      "Too many attempts from this connection. Try again in 20 seconds.",
    );
  });

  it("says how long in minutes when it is not", async () => {
    refuse("Too many failed sign-ins for this email.", "840");
    expect(await messageFrom()).toBe(
      "Too many failed sign-ins for this email. Try again in 14 minutes.",
    );
  });

  it("does not round an hour and a second up to two hours", async () => {
    // What the hour-long registration window actually hands back on a fresh refusal.
    refuse("Too many attempts from this connection.", "3601");
    expect(await messageFrom()).toBe(
      "Too many attempts from this connection. Try again in about an hour.",
    );
  });

  it("adds nothing when the server did not say", async () => {
    // The monthly voice and photo allowance refuses without a Retry-After, because it
    // lifts on the 1st rather than after a countdown, and says so itself. A guessed wait
    // would contradict it.
    const monthly =
      "You have used this month's 500 voice and photo entries. Typing one in still works, and the allowance resets on the 1st.";
    refuse(monthly);
    expect(await messageFrom()).toBe(monthly);
  });

  it("adds nothing when the header is there but unreadable", async () => {
    // What a cross-origin response looks like when CORS does not expose the header. It
    // should degrade to the plain message, not to "Try again in NaN minutes".
    refuse("Too many attempts from this connection.", "not-a-number");
    expect(await messageFrom()).toBe("Too many attempts from this connection.");
  });
});
