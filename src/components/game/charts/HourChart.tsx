'use client';

import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { buildCandleChart, type Candle } from '@/lib/candles';
import { shownIndex, type Inspection } from '@/lib/chart-inspect';
import {
	Axis,
	CHART_PADDING,
	Crosshair,
	GridLines,
	Inspector,
	LockedLine,
	ReadoutTip,
	plotWidthOf,
	useSize,
} from './chart-parts';
import { frame } from './chart-parts.styles';
import { candleReadout, formatUsd } from '../utils';
import type { CandlesState } from '../hooks';
import { styles } from './HourChart.styles';

/** Below this width the first label is shortened, or it runs into "45". */
const NARROW = 480;

/** What a screen reader gets instead of the picture. */
function describe(candles: Candle[]): string {
	if (candles.length === 0) {
		return 'No price data for the last hour.';
	}
	const first = candles[0].open;
	const last = candles[candles.length - 1].close;
	const high = Math.max(...candles.map((c) => c.high));
	const low = Math.min(...candles.map((c) => c.low));
	return `BTC/USD over the last hour: from ${formatUsd(first)} to ${formatUsd(last)}, high ${formatUsd(high)}, low ${formatUsd(low)}.`;
}

/**
 * The last hour of one-minute candles (engineering spec §7.1): four paths,
 * light gridlines, a dashed line at the latest price. While a guess is in
 * play or just settled, it carries the guess (product spec §6.1): a dashed
 * line at the locked price and the minute since the guess shaded. Each
 * minute can be read on its own, by pointer or keyboard, through the
 * inspector. Cosmetic by construction - nothing here reaches the server.
 */
export function HourChart({
	state,
	lock,
	hasPrice = true,
}: {
	state: CandlesState;
	/** Whether the card shows a game price above the chart, for the note below. */
	hasPrice?: boolean;
	/** The guess to mark: its locked price and when it was locked. */
	lock: { price: number; at: number } | null;
}) {
	const [ref, { width, height }] = useSize<HTMLDivElement>();
	const [inspected, setInspected] = useState<Inspection | null>(null);
	// The candles fill the plot; the price labels take the gutter beside it.
	const plotWidth = plotWidthOf(width);

	const chart =
		state.kind === 'ready' && plotWidth > 0
			? buildCandleChart(state.candles, {
					width: plotWidth,
					height,
					windowEnd: state.windowEnd,
					padding: CHART_PADDING,
					includePrice: lock?.price,
				})
			: null;
	const lockX =
		chart && lock
			? Math.max(0, Math.min(plotWidth, chart.xFor(lock.at)))
			: null;
	const candles = state.kind === 'ready' ? state.candles : [];
	// The hour refreshes under the inspector; it holds its candle by time.
	const times = candles.map((c) => c.time);
	const at = chart ? shownIndex(times, inspected) : null;
	const point = at !== null && at >= 0 ? chart!.candles[at] : null;

	return (
		<div {...stylex.props(frame.wrap)}>
			<div ref={ref} {...stylex.props(frame.plot)}>
				{state.kind === 'error' ? (
					<p {...stylex.props(styles.note)}>
						{hasPrice
							? "The chart is unavailable right now. The price above is the game's own and is unaffected."
							: 'The chart is unavailable right now.'}
					</p>
				) : chart && state.kind === 'ready' ? (
					<svg
						width={width}
						height={height}
						role="img"
						aria-label={describe(state.candles)}
					>
						{lockX !== null && (
							<rect
								x={lockX}
								y={0}
								width={plotWidth - lockX}
								height={height}
								{...stylex.props(styles.minute)}
							/>
						)}
						<GridLines width={width} ticks={chart.yTicks} step={chart.yStep} />
						{chart.lastCloseY !== null && !lock && (
							<line
								x1={0}
								x2={plotWidth}
								y1={chart.lastCloseY}
								y2={chart.lastCloseY}
								{...stylex.props(styles.lastPrice)}
							/>
						)}
						<path
							d={chart.upWicks}
							{...stylex.props(styles.wick, styles.upStroke)}
						/>
						<path
							d={chart.downWicks}
							{...stylex.props(styles.wick, styles.downStroke)}
						/>
						<path d={chart.upBodies} {...stylex.props(styles.upFill)} />
						<path d={chart.downBodies} {...stylex.props(styles.downHollow)} />
						{lock && lockX !== null && (
							<LockedLine
								width={plotWidth}
								y={chart.yFor(lock.price)}
								tagX={lockX}
								label="locked in"
							/>
						)}
						{point && (
							<Crosshair
								x={point.x}
								y={chart.yFor(candles[at!].close)}
								height={height}
							/>
						)}
					</svg>
				) : (
					<Skeleton width="100%" height="100%" />
				)}
				{point && (
					<ReadoutTip
						readout={candleReadout(candles[at!])}
						x={point.x}
						width={plotWidth}
					/>
				)}
				{chart && (
					<Inspector
						xs={chart.candles.map((c) => c.x)}
						times={times}
						inspection={inspected}
						onInspect={setInspected}
						label="Last hour, minute by minute"
						valueText={(i) => candleReadout(candles[i]).text}
					/>
				)}
			</div>
			<Axis
				width={width}
				ticks={[
					{
						at: 0,
						label: width > 0 && width < NARROW ? '60m' : '60 min ago',
					},
					{
						at: 0.25,
						label: '45',
					},
					{
						at: 0.5,
						label: '30',
					},
					{
						at: 0.75,
						label: '15',
					},
					{
						at: 1,
						label: 'now',
					},
				]}
			/>
		</div>
	);
}
