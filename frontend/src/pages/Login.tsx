import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth-context";
import { delay } from "@/lib/motion";

type Mode = "signin" | "register";

/** `initialMode` comes from the route, so /register lands on the right form. */
export function Login({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [timezone, setTimezone] = useState(detectTimezone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  // Held back until they have typed at least as much as the password. Checking from the
  // first keystroke means every character on the way to a correct match is answered with
  // "these do not match", which is true and useless.
  const mismatch =
    isRegister &&
    confirm.length > 0 &&
    confirm.length >= password.length &&
    confirm !== password;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (isRegister && password !== confirm) {
      setError("Those two passwords are not the same.");
      return;
    }

    setBusy(true);
    try {
      if (isRegister)
        await register({ businessName, email, password, currency, timezone });
      else await signIn(email, password);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? "signin" : "register");
    setError(null);
    // Otherwise a half-typed confirmation follows you to a form that has no such field
    // and blocks the next submit from a control that is no longer on screen.
    setConfirm("");
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_1.1fr]">
      <BrandPanel />

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10 lg:min-h-0">
        <header style={delay(60)} className="rise mb-8">
          {/* The wordmark lives in the brand panel once there is one. A link either way:
              clicking the name of the product is how everyone expects to get back to
              what it is, and arriving here from a shared link with no idea what this is
              should not need the smaller line at the bottom of the page to be spotted. */}
          <h1 className="font-display text-4xl tracking-tight lg:hidden">
            <Link to="/">Glaux Ledger</Link>
          </h1>
          <h1 className="hidden font-display text-3xl tracking-tight lg:block">
            {isRegister ? "Create your shop" : "Sign in"}
          </h1>
          <p className="mt-2 text-mute">
            {isRegister
              ? "Set up your shop. Takes about a minute."
              : "Your shop, one day at a time."}
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          style={delay(140)}
          className="rise flex flex-col gap-4"
        >
          {isRegister && (
            <Field
              label="Shop name"
              value={businessName}
              onChange={setBusinessName}
              autoComplete="organization"
              required
            />
          )}

          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            inputMode="email"
            required
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            hint={isRegister ? "At least 8 characters." : undefined}
            required
          />

          {/* There is no password reset yet, and a typo in the one field that is masked
              locks a shop out of its own book. Cheap insurance for the one screen where
              a mistake is not recoverable by trying again. */}
          {isRegister && (
            <Field
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              invalid={mismatch}
              hint={mismatch ? "These two are not the same yet." : undefined}
              required
            />
          )}

          {/* Asked here because they cannot be changed later: both reinterpret every
              figure already recorded, so Settings shows them and refuses to edit them.
              Defaulted to the shop's own clock and the home currency, side by side and
              below the credentials, so the common case is still four fields and a
              glance. */}
          {isRegister && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Choice
                label="Currency"
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES}
              />
              <Choice
                label="Timezone"
                value={timezone}
                onChange={setTimezone}
                options={timezoneOptions(timezone)}
              />
            </div>
          )}

          {isRegister && (
            <p className="-mt-1 text-xs leading-relaxed text-mute">
              Both are fixed once the shop exists, since they change what every
              recorded figure means.
            </p>
          )}

          {error && (
            // Announced rather than just shown: the field that failed may be off-screen
            // behind the keyboard.
            <p
              role="alert"
              className="rounded-sm bg-expense/8 px-3 py-2 text-sm text-expense"
            >
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="mt-2">
            {isRegister ? "Create shop" : "Sign in"}
          </Button>

          {/* Stated at the moment of agreeing rather than buried in a footer, and with
              no checkbox: a tick box in front of a shopkeeper trying to start work is a
              thing to click past, not a thing to read. */}
          {isRegister && (
            <p className="text-center text-xs leading-relaxed text-mute">
              Creating a shop means you accept the{" "}
              <Link
                to="/terms"
                className="underline underline-offset-4 hover:text-ink"
              >
                terms
              </Link>{" "}
              and the{" "}
              <Link
                to="/privacy"
                className="underline underline-offset-4 hover:text-ink"
              >
                privacy policy
              </Link>
              .
            </p>
          )}
        </form>

        <p
          style={delay(220)}
          className="rise mt-6 text-center text-sm text-mute"
        >
          {isRegister ? "Already set up?" : "New here?"}{" "}
          <button
            type="button"
            className="font-medium text-accent underline underline-offset-4"
            onClick={switchMode}
          >
            {isRegister ? "Sign in" : "Create a shop"}
          </button>
        </p>

        {/* The way back out. Arriving here from a bookmark or a shared link with no idea
            what this is used to be a dead end, since the root was this same form. */}
        <p style={delay(280)} className="rise mt-8 text-center text-sm">
          <Link to="/" className="link-sweep text-mute hover:text-ink">
            What is Glaux Ledger?
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Desktop only. A lone form centred in a 1440px window reads as an unfinished page, and
 * sign-in is the one screen with nothing else to fill the space.
 *
 * This is also the only place nyx appears in the app. It is decoration on a static page
 * rather than chrome around the shop's numbers, so it carries the parent system's look
 * without dragging the daylight theme back towards Markets.
 *
 * The ruling and the drifting gleam are the landing hero's, because someone arriving
 * here has almost always just come from it and the two should read as one surface
 * rather than as two takes on the same colour. Only those are hidden from assistive
 * tech. The panel used to be hidden whole, which meant the wordmark could not be a link
 * and, worse, that a desktop screen reader was never told the name of the product it
 * was signing in to.
 */
function BrandPanel() {
  return (
    <aside
      className="relative hidden flex-col justify-between overflow-hidden bg-nyx p-12
        text-[#dce6f4] lg:flex"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="ruled-nyx absolute inset-0" />
        {/* The gleam bleeding in from the upper right, as on the company hub. */}
        <div
          className="drift-near absolute -top-40 -right-40 size-[34rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(233,180,92,0.22) 0%, rgba(233,180,92,0) 62%)",
          }}
        />
        <div
          className="drift-far absolute -bottom-52 -left-40 size-[30rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(69,185,142,0.12) 0%, rgba(69,185,142,0) 66%)",
          }}
        />
      </div>

      <div style={delay(0)} className="rise relative">
        <Link to="/" className="font-display text-3xl tracking-tight">
          Glaux Ledger
        </Link>
        <div
          aria-hidden="true"
          className="bg-gleam mt-4 h-[3px] w-14 rounded-full"
        />
      </div>

      <div style={delay(120)} className="rise relative max-w-sm">
        <p className="font-display text-3xl leading-snug text-balance">
          A day&rsquo;s trading, recorded in seconds.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-[#8da0bc]">
          Say it, photograph the receipt, or type it. Glaux Ledger keeps the
          book so the counter stays free.
        </p>
      </div>

      <p
        style={delay(220)}
        className="rise relative text-xs tracking-[0.16em] text-[#7a8faf] uppercase"
      >
        A Glaux product
      </p>
    </aside>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  invalid?: boolean;
  [key: string]: unknown;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  invalid = false,
  ...rest
}: FieldProps) {
  const id = fieldId(label);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={`min-h-12 w-full rounded-md bg-card px-4 placeholder:text-mute
          focus:border-accent ${
            invalid ? "border-expense border" : "border border-line"
          }`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
      {hint && (
        <p
          id={`${id}-hint`}
          className={`mt-1.5 text-xs ${invalid ? "text-expense" : "text-mute"}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/** A native select, because both lists are long and neither is worth a custom widget. */
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = fieldId(label);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-md border border-line bg-card px-4
          focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const fieldId = (label: string) =>
  `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

const DEFAULT_CURRENCY = "LKR";

/**
 * The five the app has a symbol for, in `format.ts` and in the PDF's font.
 *
 * Anything else would still record and total correctly, but every figure on screen and
 * in the report handed to a bank would read "AUD 4,500" instead of a symbol. Offering a
 * currency the product renders badly is worse than not offering it.
 *
 * Labelled by code and symbol rather than by country. The full name did not fit the
 * closed select beside the timezone, and the symbol is the more useful half anyway: it
 * is what every figure in the shop's book is about to look like.
 */
const CURRENCIES = [
  { value: "LKR", label: "LKR · Rs" },
  { value: "INR", label: "INR · ₹" },
  { value: "USD", label: "USD · $" },
  { value: "EUR", label: "EUR · €" },
  { value: "GBP", label: "GBP · £" },
];

/** Where the browser already knows, which is nearly always, and Colombo where it does not. */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Colombo";
  } catch {
    return "Asia/Colombo";
  }
}

/**
 * Every zone the browser knows, with the detected one guaranteed to be among them.
 *
 * A curated shortlist was the alternative and it is the worse one: the day boundary
 * decides which day a 9pm sale belongs to, so a shop an hour off its real zone quietly
 * files takings against the wrong date for as long as it uses the product. Better a long
 * list, already set correctly, that almost nobody has to open.
 */
function timezoneOptions(detected: string) {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  if (!zones.includes(detected)) zones = [detected, ...zones];
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));
}
