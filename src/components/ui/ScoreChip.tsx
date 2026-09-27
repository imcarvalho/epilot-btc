import * as stylex from "@stylexjs/stylex";
import { Numeric } from "./Numeric";
import { Pill } from "./Pill";

/** The running score, always visible (rule R1). It may be negative. */
export function ScoreChip({ score }: { score: number }) {
  return (
    <Pill>
      <span>Score</span>
      <Numeric xstyle={styles.value}>{score}</Numeric>
    </Pill>
  );
}

const styles = stylex.create({
  value: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-bold)",
  },
});
