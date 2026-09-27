"use client";

import * as stylex from "@stylexjs/stylex";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { hourChange } from "@/lib/candles";
import { ChangeBadge, Eyebrow, Numeric, Panel } from "@/components/ui";
import { formatAge, formatUsd } from "./format";
import { HourChart } from "./HourChart";
import { useCandles } from "./useCandles";

/**
 * The price, always visible (rule R1), how old it is, and the last hour of
 * candles beneath it. The headline figure is the server's game price; the
 * chart and its hour change come from Coinbase in the browser and are
 * cosmetic (engineering spec §5).
 */
export function PriceCard({
  price,
  priceUpdatedAt,
  priceStale,
  now,
}: {
  price: number | null;
  priceUpdatedAt: number | null;
  priceStale: boolean;
  /** Server clock, so the age is not skewed by the local one. */
  now: number | null;
}) {
  const candles = useCandles();
  const change = candles.kind === "ready" ? hourChange(candles.candles) : null;
  const age = priceUpdatedAt !== null && now !== null ? formatAge(now - priceUpdatedAt) : null;

  return (
    <Panel aria-labelledby="price-heading">
      <Eyebrow>
        <span id="price-heading">Bitcoin · US Dollar</span>
      </Eyebrow>
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.figure)}>
          {price !== null ? (
            <Numeric size="hero">{formatUsd(price)}</Numeric>
          ) : (
            <Skeleton width={420} height={72} />
          )}
          {change !== null && <ChangeBadge change={change} period="in the last hour" />}
        </div>
        {age !== null && (
          <p {...stylex.props(styles.updated, priceStale && styles.stale)}>
            {priceStale
              ? `Price feed delayed. Last updated ${age}. Nothing is settled until it catches up.`
              : `Updated ${age}`}
          </p>
        )}
      </div>
      <HourChart state={candles} />
    </Panel>
  );
}

const styles = stylex.create({
  row: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
    justifyContent: "space-between",
    marginTop: "var(--spacing-5)",
  },
  figure: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-5)",
  },
  updated: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-lg)",
    margin: 0,
  },
  stale: {
    color: "var(--color-warning)",
  },
});
