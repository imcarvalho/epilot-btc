import * as stylex from "@stylexjs/stylex";
import { TrendingUp } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { palette } from "./tokens.stylex";

/** The app mark: the chart glyph on a tile blending both hero gradients. */
export function BrandMark() {
  return (
    <span aria-hidden {...stylex.props(styles.tile)}>
      <Icon icon={TrendingUp} size="md" />
    </span>
  );
}

const styles = stylex.create({
  tile: {
    alignItems: "center",
    backgroundImage: `linear-gradient(135deg, ${palette.upFrom}, ${palette.upTo} 50%, ${palette.downTo})`,
    borderRadius: "var(--radius-element)",
    color: palette.ink,
    display: "inline-flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
