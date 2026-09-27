import * as stylex from "@stylexjs/stylex";
import type { Direction } from "@/lib/resolve-guess";
import { DirectionButton } from "@/components/ui";

/** The two hero actions, side by side; stacked on a narrow screen. */
export function GuessButtons({
  onGuess,
  isDisabled,
}: {
  onGuess?: (direction: Direction) => void;
  isDisabled: boolean;
}) {
  return (
    <div role="group" aria-label="Make a guess" {...stylex.props(styles.grid)}>
      <DirectionButton direction="up" isDisabled={isDisabled} onClick={onGuess && (() => onGuess("up"))} />
      <DirectionButton direction="down" isDisabled={isDisabled} onClick={onGuess && (() => onGuess("down"))} />
    </div>
  );
}

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: "var(--spacing-4)",
    gridTemplateColumns: {
      default: "1fr 1fr",
      "@media (max-width: 640px)": "1fr",
    },
  },
});
