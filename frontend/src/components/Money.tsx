import { useCountUp } from "@/hooks/useCountUp";
import { formatAmountParts } from "@/lib/format";
import type { EntryType } from "@/lib/types";

type Size = "hero" | "total" | "row" | "small";

// Every size stays on the mono face supplied by `.tabular`. Marcellus is the brand's
// display serif and it is tempting here, but it ships a single weight and no tabular
// figures, exactly wrong for a column of amounts that has to be scanned, not admired.
// `total` steps up only once there is room. At phone width two of them sit side by
// side inside the summary card, and a five-figure amount at text-3xl wraps its sign
// onto a second line.
// The explicit leading on the two large sizes is load-bearing: Tailwind pairs text-5xl
// with line-height 1, which ends the line box on the baseline, so the comma in a figure
// like 14,450 hangs below it and touches whatever caption sits underneath.
const SIZES: Record<Size, string> = {
  hero: "text-4xl leading-[1.15] font-semibold tracking-tight sm:text-5xl",
  total: "text-2xl leading-[1.15] font-semibold tracking-tight sm:text-3xl",
  row: "text-base font-medium",
  small: "text-sm",
};

const TONES: Record<EntryType | "neutral", string> = {
  income: "text-income",
  expense: "text-expense",
  neutral: "text-ink",
};

interface MoneyProps {
  value: string | number;
  currency?: string;
  /** Omit for a neutral figure such as a net total. */
  type?: EntryType;
  size?: Size;
  /** Adds an explicit + or −, so the sign never depends on colour alone. */
  signed?: boolean;
  /** Eases into the new value. Reserved for the day total. */
  animate?: boolean;
  className?: string;
}

export function Money({
  value,
  currency = "LKR",
  type,
  size = "row",
  signed = false,
  animate = false,
  className = "",
}: MoneyProps) {
  const numeric = typeof value === "string" ? Number(value) : value;
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  const shown = animate ? animated : numeric;

  const tone = TONES[type ?? "neutral"];
  const prefix = signed && type ? (type === "income" ? "+" : "−") : "";
  const { symbol, figure } = formatAmountParts(shown, currency);

  return (
    // Never wrapped: a sign or currency symbol stranded on its own line reads as a
    // different number.
    <span
      className={`tabular whitespace-nowrap ${SIZES[size]} ${tone} ${className}`}
    >
      {prefix && <span aria-hidden="true">{prefix} </span>}
      {/* The figure is the content; the currency is a unit label. On a monospace face
          at hero size they would otherwise be equally loud, with a full mono space
          between them. Shrinking the symbol restores the hierarchy. */}
      {symbol && (
        <span className="mr-[0.15em] text-[0.62em] font-medium opacity-70">
          {symbol}
        </span>
      )}
      <Figure text={figure} />
      {prefix && (
        <span className="sr-only">
          {type === "income" ? " income" : " expense"}
        </span>
      )}
    </span>
  );
}

/**
 * A monospaced face gives the group separator a full digit cell, so `14,450` renders as
 * `14 , 450` with a gap either side, most obvious at hero size, where the day's total
 * lives. Pulling each separator in closes the gap.
 *
 * Only the separators move. The digits keep their cells, which is the part that has to
 * stay in a column, and every amount is right-aligned so a figure with one comma still
 * lines up against one with none.
 */
function Figure({ text }: { text: string }) {
  return text.split(/([,.])/).map((part, index) =>
    part === "," || part === "." ? (
      <span key={index} className="mx-[-0.17em]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
