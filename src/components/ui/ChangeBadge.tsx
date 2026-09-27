import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { palette } from "./tokens.stylex";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * A signed price change with its period: "+$1,244.80 in the last hour".
 * Direction is carried by the arrow and the sign as well as the colour.
 */
export function ChangeBadge({ change, period }: { change: number; period: string }) {
  const up = change >= 0;
  return (
    <span {...stylex.props(styles.base, up ? styles.up : styles.down)}>
      <Icon icon={up ? ArrowUp : ArrowDown} size="sm" />
      <span>
        {up ? "+" : "−"}
        {usd.format(Math.abs(change))} {period}
      </span>
    </span>
  );
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: "var(--radius-full)",
    display: "inline-flex",
    fontSize: "var(--font-size-lg)",
    fontVariantNumeric: "tabular-nums",
    fontWeight: "var(--font-weight-medium)",
    gap: "var(--spacing-1-5)",
    paddingBlock: "var(--spacing-1)",
    paddingInline: "var(--spacing-3)",
    whiteSpace: "nowrap",
  },
  up: {
    backgroundColor: palette.upWash,
    color: palette.upFrom,
  },
  down: {
    backgroundColor: palette.downWash,
    color: palette.downFrom,
  },
});
