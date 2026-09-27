import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

/** A fully rounded, outlined chip: the source badge, the score, the player. */
export function Pill({
  children,
  size = "md",
  xstyle,
}: {
  children: ReactNode;
  size?: "sm" | "md";
  xstyle?: stylex.StyleXStyles;
}) {
  return <span {...stylex.props(styles.base, styles[size], xstyle)}>{children}</span>;
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    backgroundColor: "var(--color-background-muted)",
    borderColor: "var(--color-border-emphasized)",
    borderRadius: "var(--radius-full)",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-text-secondary)",
    display: "inline-flex",
    gap: "var(--spacing-2)",
    whiteSpace: "nowrap",
  },
  sm: {
    fontSize: "var(--font-size-sm)",
    minHeight: 32,
    paddingInline: "var(--spacing-3)",
  },
  md: {
    fontSize: "var(--font-size-base)",
    minHeight: "var(--size-element-lg)",
    paddingInline: "var(--spacing-4)",
  },
});
