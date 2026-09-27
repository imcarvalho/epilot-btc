import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import type { Direction } from "@/lib/resolve-guess";
import { palette } from "./tokens.stylex";

const COPY: Record<Direction, { word: string; Arrow: typeof ArrowUp }> = {
  up: { word: "Higher", Arrow: ArrowUp },
  down: { word: "Lower", Arrow: ArrowDown },
};

/**
 * - `ready`: the gradient, clickable.
 * - `chosen`: the guess in play - stays lit, ringed and marked "chosen".
 * - `muted`: the other direction while a guess runs - flat and disabled.
 */
export type DirectionButtonMode = "ready" | "chosen" | "muted";

/**
 * One of the two hero actions. Direction is carried by an arrow and a word as
 * well as by the gradient, so it never depends on colour alone (engineering
 * spec §7.2). The accessible name is the visible text, e.g. "Higher in 60
 * seconds" or "Higher, your guess is in play, chosen".
 */
export function DirectionButton({
  direction,
  mode = "ready",
  hint,
  onClick,
  isDisabled = false,
}: {
  direction: Direction;
  mode?: DirectionButtonMode;
  /** The line under the word: "in 60 seconds", "go again", ... */
  hint: string;
  onClick?: () => void;
  isDisabled?: boolean;
}) {
  const { word, Arrow } = COPY[direction];
  const lit = mode !== "muted";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled || mode !== "ready"}
      {...stylex.props(
        styles.base,
        lit && (direction === "up" ? styles.up : styles.down),
        mode === "chosen" && (direction === "up" ? styles.chosenUp : styles.chosenDown),
        mode === "muted" && styles.muted,
      )}
    >
      <Arrow aria-hidden size={40} strokeWidth={2.5} {...stylex.props(styles.arrow)} />
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.word)}>{word}</span>
        <span {...stylex.props(styles.hint, !lit && styles.mutedHint)}>{hint}</span>
      </span>
      {mode === "chosen" && (
        <span {...stylex.props(styles.badge)}>
          <Check aria-hidden size={14} strokeWidth={3} />
          chosen
        </span>
      )}
    </button>
  );
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: "var(--radius-container)",
    borderStyle: "solid",
    borderWidth: 2,
    color: palette.ink,
    cursor: { default: "pointer", ":disabled": "default" },
    display: "flex",
    fontFamily: "inherit",
    gap: "var(--spacing-5)",
    justifyContent: "center",
    minHeight: {
      default: 172,
      "@media (max-width: 640px)": 120,
    },
    outlineColor: "var(--color-text-primary)",
    outlineOffset: 4,
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    paddingInline: "var(--spacing-6)",
    position: "relative",
    transform: {
      default: "none",
      ":hover:not(:disabled)": {
        default: "translateY(-2px)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    transitionDuration: "var(--duration-fast)",
    transitionProperty: "transform, box-shadow, filter, background-color",
    transitionTimingFunction: "var(--ease-standard)",
    filter: { default: "none", ":hover:not(:disabled)": "brightness(1.04)" },
    width: "100%",
  },
  up: {
    backgroundImage: `linear-gradient(100deg, ${palette.upFrom}, ${palette.upTo})`,
    boxShadow: `0 16px 48px -16px ${palette.upGlow}`,
  },
  down: {
    backgroundImage: `linear-gradient(100deg, ${palette.downFrom}, ${palette.downTo})`,
    boxShadow: `0 16px 48px -16px ${palette.downGlow}`,
  },
  chosenUp: {
    borderColor: palette.green,
    boxShadow: `0 0 0 4px ${palette.upWash}, 0 16px 48px -16px ${palette.upGlow}`,
  },
  chosenDown: {
    borderColor: palette.pink,
    boxShadow: `0 0 0 4px ${palette.downWash}, 0 16px 48px -16px ${palette.downGlow}`,
  },
  muted: {
    backgroundColor: "var(--color-background-card)",
    borderColor: "var(--color-border)",
    borderWidth: 1,
    color: "var(--color-text-disabled)",
  },
  arrow: {
    flexShrink: 0,
  },
  text: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
  },
  word: {
    fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
    fontWeight: "var(--font-weight-semibold)",
    letterSpacing: "-0.01em",
    lineHeight: 1.1,
  },
  hint: {
    color: palette.inkSoft,
    fontSize: "var(--font-size-lg)",
  },
  mutedHint: {
    color: "var(--color-text-disabled)",
  },
  badge: {
    alignItems: "center",
    backgroundColor: "rgba(26, 23, 38, 0.14)",
    borderRadius: "var(--radius-full)",
    display: "inline-flex",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)",
    gap: "var(--spacing-1)",
    insetBlockStart: "var(--spacing-3)",
    insetInlineEnd: "var(--spacing-3)",
    paddingBlock: "var(--spacing-1)",
    paddingInline: 10,
    position: "absolute",
  },
});
