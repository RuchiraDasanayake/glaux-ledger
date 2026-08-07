/**
 * The one place a page's measure and gutter are decided.
 *
 * Before this, each of the five surfaces set its own. Four agreed by coincidence and
 * Export did not, capping itself at `md:max-w-xl` and anchoring left, so on a 1440px
 * screen it used a quarter of the width and left the rest blank. Widths that agree by
 * coincidence stop agreeing the first time someone edits one of them.
 *
 * Measure and padding travel together because the full-bleed bars (the day header, the
 * subscription banner) have to line their contents up with the page exactly. Two
 * constants would be two things to keep in step by hand, and the failure is a left edge
 * that shifts by three pixels between the banner and the content under it.
 *
 * **There is no cap above md, and that is the point.** A capped, centred column is right
 * for prose and wrong for this: the navigation rail is hard against the left edge, so any
 * gutter to its right reads as a mistake rather than a margin, and the wider the monitor
 * the more it looks like the page failed to finish loading. Every version of this that
 * kept a ceiling (1152, then 1792) just moved the screen size at which it started
 * looking wrong. So the content fills what it is given, and the gutter grows instead, on
 * the principle that a big screen should show more rather than the same thing framed.
 */
export const CONTENT_SHELL =
  "mx-auto w-full max-w-md px-5 md:max-w-none md:px-8 xl:px-10 2xl:px-14";
