import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

/** Small, spaced, upper-case label above a figure ("BITCOIN · US DOLLAR"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p {...stylex.props(styles.base)}>{children}</p>;
}

const styles = stylex.create({
  base: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)",
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
});
