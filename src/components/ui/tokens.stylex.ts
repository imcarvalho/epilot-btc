/**
 * The app's own design tokens: what the Dracula theme has no slot for.
 *
 * Everything general - surfaces, text, borders, radii, type - comes from the
 * Astryx theme (`src/themes/dracula.theme.ts`) as `var(--color-...)`. These
 * are the few things specific to this game: the two hero gradients (the one
 * place gradient is used, engineering spec §7.1), the ink that sits on them,
 * and the Dracula hues used as icon accents.
 */

import * as stylex from "@stylexjs/stylex";

export const palette = stylex.defineVars({
  // Dracula accents
  green: "#50FA7B",
  cyan: "#8BE9FD",
  pink: "#FF79C6",
  purple: "#BD93F9",
  yellow: "#F1FA8C",

  // Pastel ends of the two hero gradients
  upFrom: "#7DFBAA",
  upTo: "#89E4FA",
  downFrom: "#FFA3D7",
  downTo: "#C7A5FF",

  // Text on a pastel gradient: dark, never white
  ink: "#1A1726",
  inkSoft: "#3B3452",

  // Soft coloured light under the hero buttons and behind the page
  upGlow: "rgba(125, 251, 170, 0.22)",
  downGlow: "rgba(255, 163, 215, 0.2)",
  pageGlow: "rgba(189, 147, 249, 0.10)",
});
