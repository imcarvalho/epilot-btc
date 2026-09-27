import * as stylex from "@stylexjs/stylex";

/**
 * What an empty panel says instead of apologising: a plain statement, then
 * what will fill the space (product spec §5, "Day zero").
 */
export function EmptyMessage({ title, body }: { title: string; body: string }) {
  return (
    <div {...stylex.props(styles.base)}>
      <p {...stylex.props(styles.title)}>{title}</p>
      <p {...stylex.props(styles.body)}>{body}</p>
    </div>
  );
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: "var(--spacing-3)",
    justifyContent: "center",
    paddingBlock: "var(--spacing-8)",
    textAlign: "center",
  },
  title: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    margin: 0,
  },
  body: {
    color: "var(--color-text-secondary)",
    margin: 0,
    maxWidth: "30rem",
    textWrap: "balance",
  },
});
