import type { ReactNode } from "react";
import { CONTENT_SHELL } from "@/lib/layout";

/** How loudly the page announces itself. It is always an h1 for a screen reader. */
type TitleVisibility = "always" | "md-up" | "never";

const TITLE_CLASS: Record<TitleVisibility, string> = {
  always: "font-display text-2xl tracking-tight md:text-3xl",
  // Hidden where vertical space is scarcer than context, and the bottom tabs already
  // name the current screen.
  "md-up":
    "sr-only font-display text-2xl tracking-tight md:not-sr-only md:text-3xl",
  never: "sr-only",
};

// An sr-only heading is out of flow and occupies nothing, so the gap below the header
// has to appear at exactly the widths where the header is visible; otherwise a phone
// gets twenty pixels of margin under nothing.
const HEADER_GAP: Record<TitleVisibility, string> = {
  always: "mb-5",
  "md-up": "md:mb-5",
  never: "",
};

/**
 * Every surface's outer wrapper: one measure, one set of padding, one h1.
 *
 * Pages own what is inside; the shell owns what is around. Nothing between the two is
 * negotiable per page any more.
 */
interface PageProps {
  title: string;
  titleVisibility?: TitleVisibility;
  /** Sits on the title row from md, and below it on a phone. */
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({
  title,
  titleVisibility = "always",
  actions,
  children,
}: PageProps) {
  return (
    <div className={`${CONTENT_SHELL} pt-6 pb-10 md:pt-8`}>
      {/* Always rendered, even when invisible: every page owes a screen reader one h1. */}
      <header
        className={`flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${
          actions ? "mb-5" : HEADER_GAP[titleVisibility]
        }`}
      >
        <h1 className={TITLE_CLASS[titleVisibility]}>{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  );
}
