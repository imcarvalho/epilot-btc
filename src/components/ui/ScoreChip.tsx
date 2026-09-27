import * as stylex from "@stylexjs/stylex";
import { Numeric } from "./Numeric";
import { Pill } from "./Pill";

/**
 * The running score, always visible (rule R1) - it may be negative - with
 * the success rate beside it once anything has resolved (product spec §6.5).
 * The score stays the primary number; the rate is secondary text.
 */
export function ScoreChip({
  score,
  wins,
  losses,
  rate,
}: {
  score: number;
  wins: number;
  losses: number;
  /** Whole percent, or null before the first result. */
  rate: number | null;
}) {
  const resolved = wins + losses;
  return (
    <Pill>
      <span>Score</span>
      <Numeric xstyle={styles.value}>{score}</Numeric>
      {rate !== null && (
        <>
          <span aria-hidden {...stylex.props(styles.divider)} />
          <span title={`${wins} of ${resolved} ${resolved === 1 ? "guess" : "guesses"} correct`}>
            <span {...stylex.props(styles.visuallyHidden)}>success rate </span>
            <Numeric xstyle={styles.rate}>{rate}%</Numeric>
          </span>
        </>
      )}
    </Pill>
  );
}

const styles = stylex.create({
  value: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-bold)",
  },
  divider: {
    alignSelf: "stretch",
    backgroundColor: "var(--color-border-emphasized)",
    marginBlock: 10,
    marginInline: "var(--spacing-1)",
    width: 1,
  },
  rate: {
    color: "var(--color-text-secondary)",
  },
  visuallyHidden: {
    border: 0,
    clip: "rect(0 0 0 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
