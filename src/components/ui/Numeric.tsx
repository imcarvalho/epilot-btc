import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

/**
 * Numbers in the monospaced face with tabular figures, so a price or a score
 * that changes does not make the text around it jump (engineering spec §7.2).
 */
export function Numeric({
  children,
  size = "inherit",
  xstyle,
}: {
  children: ReactNode;
  size?: "inherit" | "hero";
  xstyle?: stylex.StyleXStyles;
}) {
  return <span {...stylex.props(styles.base, size === "hero" && styles.hero, xstyle)}>{children}</span>;
}

const styles = stylex.create({
  base: {
    fontFamily: "var(--font-family-code)",
    fontVariantNumeric: "tabular-nums",
  },
  hero: {
    color: "var(--color-text-primary)",
    fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
    fontWeight: "var(--font-weight-bold)",
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },
});
