import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  bar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
    justifyContent: "space-between",
  },
  group: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
  },
  end: {
    gap: "var(--spacing-3)",
  },
  title: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-xl)",
    fontWeight: "var(--font-weight-semibold)",
    marginInlineEnd: "var(--spacing-2)",
  },
});
