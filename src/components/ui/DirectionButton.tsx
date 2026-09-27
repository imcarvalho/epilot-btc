import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Direction } from "@/lib/resolve-guess";
import { palette } from "./tokens.stylex";

const COPY: Record<Direction, { word: string; Arrow: typeof ArrowUp }> = {
  up: { word: "Higher", Arrow: ArrowUp },
  down: { word: "Lower", Arrow: ArrowDown },
};

/**
 * One of the two hero actions. Direction is carried by an arrow and a word as
 * well as by the gradient, so it never depends on colour alone (engineering
 * spec §7.2). The accessible name is the visible text: "Higher in 60 seconds".
 */
export function DirectionButton({
  direction,
  onClick,
  isDisabled = false,
}: {
  direction: Direction;
  onClick?: () => void;
  isDisabled?: boolean;
}) {
  const { word, Arrow } = COPY[direction];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      {...stylex.props(styles.base, direction === "up" ? styles.up : styles.down)}
    >
      <Arrow aria-hidden size={40} strokeWidth={2.5} {...stylex.props(styles.arrow)} />
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.word)}>{word}</span>
        <span {...stylex.props(styles.sub)}>in 60 seconds</span>
      </span>
    </button>
  );
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: "var(--radius-container)",
    borderStyle: "none",
    color: palette.ink,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "flex",
    fontFamily: "inherit",
    gap: "var(--spacing-5)",
    justifyContent: "center",
    minHeight: {
      default: 172,
      "@media (max-width: 640px)": 120,
    },
    opacity: { default: 1, ":disabled": 0.45 },
    outlineColor: "var(--color-text-primary)",
    outlineOffset: 4,
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    paddingInline: "var(--spacing-6)",
    transform: {
      default: "none",
      ":hover:not(:disabled)": {
        default: "translateY(-2px)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    transitionDuration: "var(--duration-fast)",
    transitionProperty: "transform, box-shadow, filter",
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
  sub: {
    color: palette.inkSoft,
    fontSize: "var(--font-size-lg)",
  },
});
