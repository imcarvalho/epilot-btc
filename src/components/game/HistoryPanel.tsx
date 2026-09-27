import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, History } from "lucide-react";
import type { PendingGuess, ResolvedGuess } from "@/lib/contracts";
import { EmptyMessage, Numeric, Panel, PanelHeader } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";

const WORD = { up: "Higher", down: "Lower" } as const;
const plain = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The player's last guesses, each with both prices, so a result can be
 * checked rather than taken on trust (product spec §6.5). A guess in play
 * sits on top as a dashed row; the result just announced is highlighted.
 */
export function HistoryPanel({
  history,
  pending,
  resolvedCount,
  highlightId,
}: {
  history: ResolvedGuess[];
  pending: PendingGuess | null;
  /** From the counters, not history.length: history is trimmed to 10. */
  resolvedCount: number;
  highlightId: string | null;
}) {
  const empty = history.length === 0 && pending === null;

  return (
    <Panel aria-labelledby="history-heading" xstyle={styles.panel}>
      <PanelHeader
        id="history-heading"
        icon={History}
        iconColor={palette.cyan}
        title="Your last guesses"
        meta={`${resolvedCount} resolved`}
      />
      {empty ? (
        <EmptyMessage
          title="No guesses yet."
          body="Each one lands here with both prices, so you can check the result rather than take our word for it."
        />
      ) : (
        <ul {...stylex.props(styles.list)}>
          {pending && (
            <li
              aria-label={`${WORD[pending.direction]} at ${plain.format(pending.priceAtGuess)}, in play.`}
              {...stylex.props(styles.row, styles.pendingRow)}
            >
              <Direction direction={pending.direction} />
              <Numeric xstyle={styles.prices}>{plain.format(pending.priceAtGuess)} → in play</Numeric>
              <span {...stylex.props(styles.outcome, styles.waiting)}>waiting</span>
              <Numeric xstyle={[styles.points, styles.waiting]}>-</Numeric>
            </li>
          )}
          {history.map((g) => {
            const won = g.delta === 1;
            return (
              <li
                key={g.id}
                aria-label={`${WORD[g.direction]}, ${plain.format(g.priceAtGuess)} to ${plain.format(g.priceAtResolve)}, ${won ? "correct, plus 1" : "wrong, minus 1"}.`}
                {...stylex.props(styles.row, g.id === highlightId && (won ? styles.highlightWin : styles.highlightLoss))}
              >
                <Direction direction={g.direction} />
                <Numeric xstyle={styles.prices}>
                  {plain.format(g.priceAtGuess)} → {plain.format(g.priceAtResolve)}
                </Numeric>
                <span {...stylex.props(styles.outcome, won ? styles.win : styles.loss)}>{won ? "correct" : "wrong"}</span>
                <Numeric xstyle={[styles.points, won ? styles.win : styles.loss]}>{won ? "+1" : "−1"}</Numeric>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Direction({ direction }: { direction: "up" | "down" }) {
  const Arrow = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <span aria-hidden {...stylex.props(styles.direction, direction === "up" ? styles.up : styles.down)}>
      <Arrow size={16} strokeWidth={2.5} />
      {WORD[direction]}
    </span>
  );
}

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", gap: "var(--spacing-4)", minHeight: 280 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: "var(--radius-element)",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: "var(--spacing-3)",
    gridTemplateColumns: "6.5rem 1fr auto 2.5rem",
    paddingBlock: "var(--spacing-2)",
    paddingInline: "var(--spacing-3)",
  },
  pendingRow: {
    borderColor: "var(--color-border-emphasized)",
    borderStyle: "dashed",
  },
  highlightWin: {
    backgroundColor: palette.upWash,
    borderColor: "rgba(125, 251, 170, 0.4)",
  },
  highlightLoss: {
    backgroundColor: "rgba(255, 138, 138, 0.06)",
    borderColor: "rgba(255, 138, 138, 0.4)",
  },
  direction: {
    alignItems: "center",
    display: "inline-flex",
    gap: "var(--spacing-1)",
  },
  up: { color: palette.upFrom },
  down: { color: palette.downTo },
  prices: {
    color: "var(--color-text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  outcome: {
    fontSize: "var(--font-size-sm)",
  },
  points: {
    fontWeight: "var(--font-weight-semibold)",
    textAlign: "end",
  },
  win: { color: palette.upFrom },
  loss: { color: "var(--color-error)" },
  waiting: { color: "var(--color-text-secondary)" },
});
