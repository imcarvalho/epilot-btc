import * as stylex from "@stylexjs/stylex";
import type { ComponentType, SVGProps } from "react";
import { Icon } from "@astryxdesign/core/Icon";
import { styles } from "./IconTile.styles";

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
