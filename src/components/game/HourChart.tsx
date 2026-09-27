"use client";

import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { buildCandleChart, type Candle } from "@/lib/candles";
import { palette } from "@/components/ui/tokens.stylex";
import { formatUsd } from "./format";
import type { CandlesState } from "./useCandles";

const HEIGHT = 300;
const GRID_LINES = 4;
/** Below this width the first label is shortened, or it runs into "45". */
const NARROW = 480;
const TICKS = [
  { at: 0, label: "60 min ago", short: "60m" },
  { at: 0.25, label: "45" },
  { at: 0.5, label: "30" },
  { at: 0.75, label: "15" },
  { at: 1, label: "now" },
];

/** Width of an element, tracked as it resizes. The chart is drawn in real pixels. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** What a screen reader gets instead of the picture. */
function describe(candles: Candle[]): string {
  if (candles.length === 0) return "No price data for the last hour.";
  const first = candles[0].open;
  const last = candles[candles.length - 1].close;
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  return `BTC/USD over the last hour: from ${formatUsd(first)} to ${formatUsd(last)}, high ${formatUsd(high)}, low ${formatUsd(low)}.`;
}

/**
 * The last hour of one-minute candles (engineering spec §7.1): four paths,
 * light gridlines, a dashed line at the latest price. Cosmetic by
 * construction - nothing here reaches the server.
 */
export function HourChart({ state }: { state: CandlesState }) {
  const [ref, width] = useWidth<HTMLDivElement>();

  const chart =
    state.kind === "ready" && width > 0
      ? buildCandleChart(state.candles, { width, height: HEIGHT, windowEnd: state.windowEnd, padding: 12 })
      : null;

  return (
    <div {...stylex.props(styles.wrap)}>
      <div ref={ref} {...stylex.props(styles.plot)}>
        {state.kind === "error" ? (
          <p {...stylex.props(styles.note)}>
            The chart is unavailable right now. The price above is the game&apos;s own and is unaffected.
          </p>
        ) : chart && state.kind === "ready" ? (
          <svg width={width} height={HEIGHT} role="img" aria-label={describe(state.candles)}>
            <g {...stylex.props(styles.grid)}>
              {Array.from({ length: GRID_LINES }, (_, i) => {
                const y = 12 + (i * (HEIGHT - 24)) / (GRID_LINES - 1);
                return <line key={i} x1={0} x2={width} y1={y} y2={y} />;
              })}
            </g>
            {chart.lastCloseY !== null && (
              <line
                x1={0}
                x2={width}
                y1={chart.lastCloseY}
                y2={chart.lastCloseY}
                {...stylex.props(styles.lastPrice)}
              />
            )}
            <path d={chart.upWicks} {...stylex.props(styles.wick, styles.upStroke)} />
            <path d={chart.downWicks} {...stylex.props(styles.wick, styles.downStroke)} />
            <path d={chart.upBodies} {...stylex.props(styles.upFill)} />
            <path d={chart.downBodies} {...stylex.props(styles.downFill)} />
          </svg>
        ) : (
          <Skeleton width="100%" height={HEIGHT} />
        )}
      </div>
      <div aria-hidden {...stylex.props(styles.axis)}>
        {TICKS.map((t) => (
          <span key={t.label} {...stylex.props(styles.tick(t.at))}>
            {width > 0 && width < NARROW && "short" in t ? t.short : t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const styles = stylex.create({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-4)",
    marginTop: "var(--spacing-8)",
  },
  plot: {
    height: HEIGHT,
    width: "100%",
  },
  grid: {
    stroke: "var(--color-border)",
    strokeWidth: 1,
  },
  lastPrice: {
    stroke: "var(--color-text-disabled)",
    strokeDasharray: "4 6",
    strokeWidth: 1,
  },
  wick: {
    fill: "none",
    strokeLinecap: "round",
    strokeWidth: 1.5,
  },
  upStroke: { stroke: palette.upFrom },
  downStroke: { stroke: palette.downFrom },
  upFill: { fill: palette.upFrom },
  downFill: { fill: palette.downFrom },
  axis: {
    color: "var(--color-text-secondary)",
    fontFamily: "var(--font-family-code)",
    fontSize: "var(--font-size-sm)",
    height: "1.25em",
    position: "relative",
  },
  // The two ends align to the edges; the rest centre on their mark.
  tick: (at: number) => ({
    left: `${at * 100}%`,
    position: "absolute",
    transform: at === 0 ? "none" : at === 1 ? "translateX(-100%)" : "translateX(-50%)",
    whiteSpace: "nowrap",
  }),
  note: {
    alignItems: "center",
    color: "var(--color-text-secondary)",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    margin: 0,
  },
});
