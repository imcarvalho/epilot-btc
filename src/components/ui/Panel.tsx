import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { styles } from "./Panel.styles";

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
