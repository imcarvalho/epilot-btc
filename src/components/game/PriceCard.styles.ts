import * as stylex from "@stylexjs/stylex";
import { palette } from "@/components/ui/tokens.stylex";

export const styles = stylex.create({
  header: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
    justifyContent: "space-between",
  },
  headline: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-5)",
  },
  figure: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-5)",
  },
  side: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-5)",
  },
  caption: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-sm)",
  },
  updated: {
    fontSize: "var(--font-size-lg)",
    margin: 0,
  },
  stale: {
    color: "var(--color-warning)",
  },
  countdown: {
    alignItems: "flex-end",
    borderInlineEndColor: "var(--color-border)",
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
    paddingInlineEnd: "var(--spacing-5)",
  },
  countdownValue: {
    color: palette.purple,
    fontSize: "var(--font-size-4xl)",
    fontWeight: "var(--font-weight-bold)",
    lineHeight: 1,
  },
  countdownDone: {
    color: palette.yellow,
  },
});
