import { Money } from "@/components/Money";
import { CONTENT_SHELL } from "@/lib/layout";
import type { Summary } from "@/lib/types";

interface DayTotalHeaderProps {
  summary: Summary | undefined;
  currency: string;
  timezone: string;
}

/**
 * Sticky by design. The brief asks for the day's total visible without scrolling; fixing
 * it to the top means it is visible always, including while an entry is being confirmed.
 */
export function DayTotalHeader({
  summary,
  currency,
  timezone,
}: DayTotalHeaderProps) {
  const today = new Date().toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  });

  return (
    <header
      // pt-3 on a phone because the shop name and settings row sits directly above;
      // from md that row is gone and the header carries the full top margin again.
      //
      // Full-bleed bar, centred contents: the rule underneath should reach both edges of
      // the screen, while the figures line up with the page below it.
      className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur"
    >
      <div className={`${CONTENT_SHELL} pt-3 pb-4 md:pt-8 md:pb-6`}>
        <div className="flex items-baseline justify-between">
          {/* Not the page's heading: it labels this figure. QuickEntry's h1 lives on
              the Page wrapper, where every other surface keeps its own. */}
          <span className="eyebrow">Today</span>
          <time className="text-sm text-mute">{today}</time>
        </div>

        {/* Announced when it changes, so a confirmed entry is confirmed for screen
            reader users too, not only by the count-up animation. */}
        <div className="mt-3 flex items-end justify-between" aria-live="polite">
          <div>
            <Money
              value={summary?.net ?? 0}
              currency={currency}
              size="hero"
              animate
              className="block"
            />
            <span className="mt-0.5 block text-xs text-mute">Net today</span>
          </div>

          <dl className="text-right">
            <div className="flex items-baseline justify-end gap-2">
              <dt className="sr-only">Income</dt>
              <dd>
                <Money
                  value={summary?.income ?? 0}
                  currency={currency}
                  type="income"
                  signed
                />
              </dd>
            </div>
            <div className="mt-1 flex items-baseline justify-end gap-2">
              <dt className="sr-only">Expenses</dt>
              <dd>
                <Money
                  value={summary?.expense ?? 0}
                  currency={currency}
                  type="expense"
                  signed
                />
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </header>
  );
}
