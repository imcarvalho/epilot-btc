'use client';

import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { buildCandleChart, type Candle } from '@/lib/candles';
import {
	Axis,
	CHART_HEIGHT,
	CHART_PADDING,
	Crosshair,
	GridLines,
	Inspector,
	LockedLine,
	ReadoutTip,
	useWidth,
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
}: {
	state: CandlesState;
	/** The guess to mark: its locked price and when it was locked. */
	lock: { price: number; at: number } | null;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [inspected, setInspected] = useState<number | null>(null);

	const chart =
		state.kind === 'ready' && width > 0
			? buildCandleChart(state.candles, {
					width,
					height: CHART_HEIGHT,
					windowEnd: state.windowEnd,
					padding: CHART_PADDING,
					includePrice: lock?.price,
				})
			: null;
	const lockX =
		chart && lock ? Math.max(0, Math.min(width, chart.xFor(lock.at))) : null;
	const candles = state.kind === 'ready' ? state.candles : [];
	// The hour refreshes under the inspector; hold it to the candles there are.
	const at =
		chart && inspected !== null
			? Math.min(inspected, chart.candles.length - 1)
			: null;
	const point = at !== null && at >= 0 ? chart!.candles[at] : null;

	return (
		<div {...stylex.props(frame.wrap)}>
			<div ref={ref} {...stylex.props(frame.plot)}>
				{state.kind === 'error' ? (
					<p {...stylex.props(styles.note)}>
						The chart is unavailable right now. The price above is the
						game&apos;s own and is unaffected.
					</p>
				) : chart && state.kind === 'ready' ? (
					<svg
						width={width}
						height={CHART_HEIGHT}
						role="img"
						aria-label={describe(state.candles)}
					>
						{lockX !== null && (
							<rect
								x={lockX}
								y={0}
								width={width - lockX}
								height={CHART_HEIGHT}
								{...stylex.props(styles.minute)}
							/>
						)}
						<GridLines width={width} />
						{chart.lastCloseY !== null && !lock && (
							<line
								x1={0}
								x2={width}
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
						<path d={chart.downBodies} {...stylex.props(styles.downFill)} />
						{lock && lockX !== null && (
							<LockedLine
								width={width}
								y={chart.yFor(lock.price)}
								tagX={lockX}
								label="locked in"
							/>
						)}
						{point && (
							<Crosshair x={point.x} y={chart.yFor(candles[at!].close)} />
						)}
					</svg>
				) : (
					<Skeleton width="100%" height={CHART_HEIGHT} />
				)}
				{point && (
					<ReadoutTip
						readout={candleReadout(candles[at!])}
						x={point.x}
						width={width}
					/>
				)}
				{chart && (
					<Inspector
						xs={chart.candles.map((c) => c.x)}
						index={at}
						onIndex={setInspected}
						label="Last hour, minute by minute"
						valueText={(i) => candleReadout(candles[i]).text}
					/>
				)}
			</div>
			<Axis
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
