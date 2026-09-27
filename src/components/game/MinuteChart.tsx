"use client";

import * as stylex from "@stylexjs/stylex";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import type { PendingGuess } from "@/lib/contracts";
import { buildMinuteChart, standing } from "@/lib/live-minute";
import { palette } from "@/components/ui/tokens.stylex";
import { Axis, CHART_HEIGHT, CHART_PADDING, GridLines, LockedLine, PointTag, frame, useWidth } from "./chart-parts";
import { formatUsd } from "./format";
import type { LiveMinute } from "./useLiveMinute";

const plain = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "ahead by $118.20", "behind by $4.10", "level". */
export function standingPhrase(margin: number): string {
  if (margin === 0) return "level";
  return `${margin > 0 ? "ahead" : "behind"} by ${formatUsd(Math.abs(margin))}`;
}

/**
 * The minute itself (product spec §6.1, "This guess"): one point per second
 * from the browser's ticker, against the dashed line where the guess was
 * locked. The shaded area between them is the margin the player is winning
 * or losing by, and the axis is the countdown.
 *
 * Indicative, and it says so: the result is settled on the server with its
 * own price, which may differ by a few cents.
 */
export function MinuteChart({ guess, live, now }: { guess: PendingGuess; live: LiveMinute; now: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const chart =
    width > 0
      ? buildMinuteChart(live.samples, {
          width,
          height: CHART_HEIGHT,
          start: guess.createdAt,
          lockedPrice: guess.priceAtGuess,
          now,
          padding: CHART_PADDING,
        })
      : null;

  const current = live.price !== null ? standing(guess.direction, guess.priceAtGuess, live.price) : null;
  const tone = current === null || current.ahead === null ? "level" : current.ahead ? "ahead" : "behind";
  const last = chart?.points[chart.points.length - 1];
  const totalSeconds = chart ? Math.round((chart.windowEnd - guess.createdAt) / 1000) : 60;

  const description =
    live.price === null
      ? `The minute since your guess, locked at ${formatUsd(guess.priceAtGuess)}. Waiting for the live price.`
      : `The minute since your guess: locked at ${formatUsd(guess.priceAtGuess)}, now ${formatUsd(live.price)}, ${standingPhrase(current!.margin)}, provisional.`;

  return (
    <div {...stylex.props(frame.wrap)}>
      <div ref={ref} {...stylex.props(frame.plot)}>
        {chart && last ? (
          <svg width={width} height={CHART_HEIGHT} role="img" aria-label={description}>
            {chart.nowX < width && (
              <rect x={chart.nowX} y={0} width={width - chart.nowX} height={CHART_HEIGHT} {...stylex.props(styles.future)} />
            )}
            <GridLines width={width} />
            <path d={chart.area} {...stylex.props(styles.area, live.isAlive ? styles[`${tone}Area`] : styles.offArea)} />
            <LockedLine
              width={width}
              y={chart.lockedY}
              tagX={0}
              label={`locked at ${plain.format(guess.priceAtGuess)}`}
            />
            <path d={chart.line} {...stylex.props(styles.line, live.isAlive ? styles[`${tone}Line`] : styles.offLine)} />
            {chart.points.length > 1 && (
              <>
                <circle cx={last.x} cy={last.y} r={5} {...stylex.props(live.isAlive ? styles[`${tone}Dot`] : styles.offDot)} />
                {current && live.isAlive && (
                  <PointTag
                    width={width}
                    x={last.x}
                    y={last.y}
                    tone={tone}
                    label={`${standingPhrase(current.margin)} · provisional`}
                  />
                )}
              </>
            )}
          </svg>
        ) : (
          <Skeleton width="100%" height={CHART_HEIGHT} />
        )}
        {!live.isAlive && (
          <p {...stylex.props(styles.note)}>
            {live.price === null ? "Connecting to the live price..." : "Reconnecting to the live price..."}
          </p>
        )}
      </div>
      <Axis
        ticks={[
          { at: 0, label: "guess" },
          { at: 0.25, label: `+${Math.round(totalSeconds * 0.25)}s` },
          { at: 0.5, label: `+${Math.round(totalSeconds * 0.5)}s` },
          { at: 0.75, label: `+${Math.round(totalSeconds * 0.75)}s` },
          { at: 1, label: `+${totalSeconds}s` },
        ]}
      />
    </div>
  );
}

const styles = stylex.create({
  future: {
    fill: "rgba(0, 0, 0, 0.18)",
  },
  area: {
    stroke: "none",
  },
  aheadArea: { fill: "rgba(125, 251, 170, 0.14)" },
  behindArea: { fill: "rgba(255, 138, 138, 0.14)" },
  levelArea: { fill: "rgba(241, 250, 140, 0.08)" },
  offArea: { fill: "rgba(255, 255, 255, 0.04)" },
  line: {
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
  },
  aheadLine: { stroke: palette.upFrom },
  behindLine: { stroke: "var(--color-error)" },
  levelLine: { stroke: palette.yellow },
  offLine: { stroke: "var(--color-text-disabled)" },
  aheadDot: { fill: palette.upFrom },
  behindDot: { fill: "var(--color-error)" },
  levelDot: { fill: palette.yellow },
  offDot: { fill: "var(--color-text-disabled)" },
  note: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-sm)",
    insetBlockStart: "var(--spacing-2)",
    insetInlineStart: "var(--spacing-2)",
    margin: 0,
    position: "absolute",
  },
});
