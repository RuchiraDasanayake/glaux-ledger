import type { CSSProperties } from "react";

/**
 * The stagger step for an entrance, as an inline custom property.
 *
 * Both `.rise` (in view at load) and `.reveal-in` (arriving on scroll) read the same
 * variable, so a section can hand out one scale of delay without caring which of the
 * two it is using, and the CSS keeps a single place where a delay of zero means "now".
 */
export const delay = (ms: number) =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;
