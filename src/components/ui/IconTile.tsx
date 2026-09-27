import * as stylex from "@stylexjs/stylex";
import type { ComponentType, SVGProps } from "react";
import { Icon } from "@astryxdesign/core/Icon";
import { palette } from "./tokens.stylex";

/**
 * The rounded square that leads a strip: the direction of the guess in play,
 * or the outcome of a result. Decorative - the words beside it say the same.
 */
export function IconTile({
  icon,
  tone,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: "up" | "down" | "win" | "loss";
}) {
  return (
    <span aria-hidden {...stylex.props(styles.base, styles[tone])}>
      <Icon icon={icon} size="md" />
    </span>
  );
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: "var(--radius-element)",
    color: palette.ink,
    display: "inline-flex",
    flexShrink: 0,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  up: { backgroundImage: `linear-gradient(135deg, ${palette.upFrom}, ${palette.upTo})` },
  down: { backgroundImage: `linear-gradient(135deg, ${palette.downFrom}, ${palette.downTo})` },
  win: { backgroundImage: `linear-gradient(135deg, ${palette.upFrom}, ${palette.upTo})` },
  // Pastel coral rather than Dracula's full red (product spec §6.4).
  loss: { backgroundColor: "var(--color-error)" },
});
