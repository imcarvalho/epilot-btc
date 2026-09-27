"use client";

import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { palette } from "@/components/ui/tokens.stylex";

/** Both charts share one height, so switching views does not move the page. */
export const CHART_HEIGHT = 300;
export const CHART_PADDING = 12;
const GRID_LINES = 4;

/** Width of an element, tracked as it resizes. The charts are drawn in real pixels. */
export function useWidth<T extends HTMLElement>() {
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

export function GridLines({ width }: { width: number }) {
  return (
    <g {...stylex.props(styles.grid)}>
      {Array.from({ length: GRID_LINES }, (_, i) => {
        const y = CHART_PADDING + (i * (CHART_HEIGHT - 2 * CHART_PADDING)) / (GRID_LINES - 1);
        return <line key={i} x1={0} x2={width} y1={y} y2={y} />;
      })}
    </g>
  );
}

/**
 * The guess's locked price across the chart: dashed, in the one colour kept
 * for it, with a small tag. The tag sits above the line unless that would
 * run off the top.
 */
export function LockedLine({ width, y, tagX, label }: { width: number; y: number; tagX: number; label: string }) {
  const tagWidth = label.length * 7.4 + 18;
  const x = Math.min(Math.max(0, tagX - tagWidth / 2), width - tagWidth);
  const above = y - 30 >= 0;
  const tagY = above ? y - 30 : y + 8;
  return (
    <g>
      <line x1={0} x2={width} y1={y} y2={y} {...stylex.props(styles.locked)} />
      <rect x={x} y={tagY} width={tagWidth} height={22} rx={6} {...stylex.props(styles.tag)} />
      <text x={x + tagWidth / 2} y={tagY + 15} textAnchor="middle" {...stylex.props(styles.tagText, styles.lockedText)}>
        {label}
      </text>
    </g>
  );
}

/** A tag with a coloured label, anchored to a point on the chart. */
export function PointTag({
  width,
  x,
  y,
  label,
  tone,
}: {
  width: number;
  x: number;
  y: number;
  label: string;
  tone: "ahead" | "behind" | "level";
}) {
  const tagWidth = label.length * 7 + 20;
  const left = Math.min(Math.max(0, x - tagWidth / 2), width - tagWidth);
  const above = y - 36 >= 0;
  const tagY = above ? y - 36 : y + 12;
  return (
    <g>
      <rect x={left} y={tagY} width={tagWidth} height={24} rx={6} {...stylex.props(styles.tag)} />
      <text x={left + tagWidth / 2} y={tagY + 16} textAnchor="middle" {...stylex.props(styles.tagText, styles[tone])}>
        {label}
      </text>
    </g>
  );
}

export function Axis({ ticks }: { ticks: { at: number; label: string }[] }) {
  return (
    <div aria-hidden {...stylex.props(styles.axis)}>
      {ticks.map((t) => (
        <span key={t.label} {...stylex.props(styles.tick(t.at))}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Shared frame styles, compiled here: StyleX resolves values at build time,
 * so another file cannot build its own from CHART_HEIGHT.
 */
export const frame = stylex.create({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-4)",
    marginTop: "var(--spacing-8)",
  },
  plot: {
    height: 300,
    position: "relative",
    width: "100%",
  },
});

const styles = stylex.create({
  grid: {
    stroke: "var(--color-border)",
    strokeWidth: 1,
  },
  locked: {
    stroke: palette.yellow,
    strokeDasharray: "8 6",
    strokeWidth: 1.5,
  },
  tag: {
    fill: "#16171F",
    stroke: "var(--color-border)",
    strokeWidth: 1,
  },
  tagText: {
    fontFamily: "var(--font-family-code)",
    fontSize: 13,
  },
  lockedText: { fill: palette.yellow },
  ahead: { fill: palette.upFrom },
  behind: { fill: "var(--color-error)" },
  level: { fill: palette.yellow },
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
});
