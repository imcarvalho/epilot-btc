import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
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
