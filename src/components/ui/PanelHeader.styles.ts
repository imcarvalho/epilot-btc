import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: "var(--spacing-3)",
  },
  icon: (color: string) => ({
    color,
    display: "inline-flex",
  }),
  title: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-medium)",
    margin: 0,
  },
  meta: {
    marginInlineStart: "auto",
  },
});
