import * as stylex from "@stylexjs/stylex";
import { palette } from "@/components/ui/tokens.stylex";

/**
 * Shared frame styles, compiled here: StyleX resolves values at build time,
 * so another file cannot build its own from CHART_HEIGHT.
 */
export const frame = stylex.create({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-4)",
    marginTop: "var(--spacing-8)",
  },
  plot: {
    height: 300,
    position: "relative",
    width: "100%",
  },
});

export const styles = stylex.create({
  grid: {
    stroke: "var(--color-border)",
    strokeWidth: 1,
  },
  locked: {
    stroke: palette.yellow,
    strokeDasharray: "8 6",
    strokeWidth: 1.5,
  },
  tag: {
    fill: "#16171F",
    stroke: "var(--color-border)",
    strokeWidth: 1,
  },
  tagText: {
    fontFamily: "var(--font-family-code)",
    fontSize: 13,
  },
  lockedText: { fill: palette.yellow },
  ahead: { fill: palette.upFrom },
  behind: { fill: "var(--color-error)" },
  level: { fill: palette.yellow },
  axis: {
    color: "var(--color-text-secondary)",
    fontFamily: "var(--font-family-code)",
    fontSize: "var(--font-size-sm)",
    height: "1.25em",
    position: "relative",
  },
  // The two ends align to the edges; the rest centre on their mark.
  tick: (at: number) => ({
    left: `${at * 100}%`,
    position: "absolute",
    transform: at === 0 ? "none" : at === 1 ? "translateX(-100%)" : "translateX(-50%)",
    whiteSpace: "nowrap",
  }),
});
