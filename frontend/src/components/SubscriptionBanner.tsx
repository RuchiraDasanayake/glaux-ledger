import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { daysLeftLabel, shouldWarn } from "@/lib/billing";
import { CONTENT_SHELL } from "@/lib/layout";

/**
 * The only place the app ever mentions money unprompted, and it stays quiet until the
 * last week of the trial.
 *
 * A lapsed shop gets a banner that leads with what still works. Someone who has just
 * been told they cannot record a sale is already deciding whether this app can be
 * trusted with their books, and "your records are safe, you can still export them" is
 * the answer that keeps them; burying it under a renewal pitch is the one that does
 * not.
 */
export function SubscriptionBanner() {
  const { business } = useAuth();
  if (!shouldWarn(business) || !business) return null;

  const lapsed = business.status === "lapsed";

  return (
    <div
      role="status"
      className={`border-b py-2.5 text-sm ${
        lapsed
          ? "bg-expense-wash border-expense/20 text-expense"
          : "border-accent-edge/25 bg-accent-wash text-accent"
      }`}
    >
      {/* Same shell as the page beneath it, so the banner's text starts on the same left
          edge as the content it is warning about. The padding comes with it, which is why
          the bar itself carries none. */}
      <div
        className={`${CONTENT_SHELL} flex flex-wrap items-baseline gap-x-2 gap-y-1`}
      >
        <span className="font-medium">
          {lapsed
            ? "Subscription ended"
            : daysLeftLabel(business.trial_days_left)}
        </span>
        <span className="opacity-80">
          {lapsed
            ? "Your records are all still here. Reading and exporting keep working. Renew to record new entries."
            : "Keep recording after it ends by renewing."}
        </span>
        <Link
          to="/settings#billing"
          className="ml-auto shrink-0 font-medium whitespace-nowrap underline underline-offset-2"
        >
          {lapsed ? "How to renew" : "See pricing"}
        </Link>
      </div>
    </div>
  );
}
