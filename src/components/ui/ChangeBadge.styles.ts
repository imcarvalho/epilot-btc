import * as stylex from "@stylexjs/stylex";
import { palette } from "./tokens.stylex";

export const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: "var(--radius-full)",
    display: "inline-flex",
    fontSize: "var(--font-size-lg)",
    fontVariantNumeric: "tabular-nums",
    fontWeight: "var(--font-weight-medium)",
    gap: "var(--spacing-1-5)",
    paddingBlock: "var(--spacing-1)",
    paddingInline: "var(--spacing-3)",
    whiteSpace: "nowrap",
  },
  up: {
    backgroundColor: palette.upWash,
    color: palette.upFrom,
  },
  down: {
    backgroundColor: palette.downWash,
    color: palette.downFrom,
  },
  flat: {
    backgroundColor: "rgba(241, 250, 140, 0.1)",
    color: palette.yellow,
  },
});
