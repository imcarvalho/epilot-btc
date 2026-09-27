import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  grid: {
    display: "grid",
    gap: "var(--spacing-4)",
    gridTemplateColumns: {
      default: "1fr 1fr",
      "@media (max-width: 640px)": "1fr",
    },
  },
});
