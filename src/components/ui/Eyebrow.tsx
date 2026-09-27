import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { styles } from "./Eyebrow.styles";

/** Small, spaced, upper-case label above a figure ("BITCOIN · US DOLLAR"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p {...stylex.props(styles.base)}>{children}</p>;
}
