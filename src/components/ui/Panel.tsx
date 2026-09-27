import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

/**
 * The one container shape in the app: a dark surface with a hairline border
 * and the theme's container radius. `dashed` is the quieter variant for a
 * space that is waiting to be filled (the guess strip before a first guess).
 */
export function Panel({
  children,
  variant = "solid",
  tone = "neutral",
  as: Element = "section",
  xstyle,
  ...aria
}: {
  children: ReactNode;
  variant?: "solid" | "dashed";
  /** Colours the border and ground: a waiting state, or an outcome. */
  tone?: "neutral" | "warning" | "win" | "loss";
  as?: "section" | "div" | "aside";
  xstyle?: stylex.StyleXStyles;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <Element {...aria} {...stylex.props(styles.base, variant === "dashed" && styles.dashed, tone !== "neutral" && styles[tone], xstyle)}>
      {children}
    </Element>
  );
}

const styles = stylex.create({
  base: {
    backgroundColor: "var(--color-background-card)",
    borderColor: "var(--color-border)",
    borderRadius: "var(--radius-container)",
    borderStyle: "solid",
    borderWidth: 1,
    padding: {
      default: "var(--spacing-10)",
      "@media (max-width: 640px)": "var(--spacing-6)",
    },
  },
  dashed: {
    backgroundColor: "transparent",
    borderColor: "var(--color-border-emphasized)",
    borderStyle: "dashed",
    paddingBlock: "var(--spacing-6)",
  },
  warning: {
    backgroundColor: "rgba(241, 250, 140, 0.04)",
    borderColor: "rgba(241, 250, 140, 0.35)",
  },
  win: {
    backgroundColor: "rgba(125, 251, 170, 0.06)",
    borderColor: "rgba(125, 251, 170, 0.4)",
  },
  loss: {
    backgroundColor: "rgba(255, 138, 138, 0.06)",
    borderColor: "rgba(255, 138, 138, 0.4)",
  },
});
