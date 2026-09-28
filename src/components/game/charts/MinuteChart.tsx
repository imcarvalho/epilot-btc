'use client';

import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { shownIndex, type Inspection } from '@/lib/chart-inspect';
import type { PendingGuess } from '@/lib/contracts';
import { buildMinuteChart, standing } from '@/lib/live-minute';
import {
	Axis,
	CHART_HEIGHT,
	CHART_PADDING,
	Crosshair,
	GridLines,
	Inspector,
	LockedLine,
	PointTag,
	ReadoutTip,
	plotWidthOf,
	useWidth,
} from './chart-parts';
import { frame } from './chart-parts.styles';
import { formatUsd, sampleReadout, standingPhrase } from '../utils';
import type { LiveMinute } from '../hooks';
import { styles } from './MinuteChart.styles';

const plain = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/**
 * The minute itself (product spec §6.1, "This guess"): one point per second
 * of the game price the stream sends, against the dashed line where the guess was
 * locked. The shaded area between them is the margin the player is winning
 * or losing by, and the axis is the countdown. Any second can be read back
 * through the inspector, by pointer or keyboard.
 *
 * Indicative, and it says so: the result is settled on the server against
 * the trade at the deadline, which may differ by a few cents.
 */
export function MinuteChart({
	guess,
	live,
	now,
}: {
	guess: PendingGuess;
	live: LiveMinute;
	now: number;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [inspected, setInspected] = useState<Inspection | null>(null);
	// The line fills the plot; the price labels take the gutter beside it.
	const plotWidth = plotWidthOf(width);
	const chart =
		plotWidth > 0
			? buildMinuteChart(live.samples, {
					width: plotWidth,
					height: CHART_HEIGHT,
					start: guess.createdAt,
					lockedPrice: guess.priceAtGuess,
					now,
					padding: CHART_PADDING,
				})
			: null;

	const current =
		live.price !== null
			? standing(guess.direction, guess.priceAtGuess, live.price)
			: null;
	const tone =
		current === null || current.ahead === null
			? 'level'
			: current.ahead
				? 'ahead'
				: 'behind';
	const last = chart?.points[chart.points.length - 1];
	// A point a second: the inspector holds its second by time as they come.
	const times = chart ? chart.points.map((p) => p.t) : [];
	const at = chart ? shownIndex(times, inspected) : null;
	const point = at !== null ? chart!.points[at] : null;
	const totalSeconds = chart
		? Math.round((chart.windowEnd - guess.createdAt) / 1000)
		: 60;

	const description =
		live.price === null
			? `The minute since your guess, locked at ${formatUsd(guess.priceAtGuess)}. Waiting for the live price.`
			: `The minute since your guess: locked at ${formatUsd(guess.priceAtGuess)}, now ${formatUsd(live.price)}, ${standingPhrase(current!.margin)}, provisional.`;

	return (
		<div {...stylex.props(frame.wrap)}>
			<div ref={ref} {...stylex.props(frame.plot)}>
				{chart && last ? (
					<svg
						width={width}
						height={CHART_HEIGHT}
						role="img"
						aria-label={description}
					>
						{chart.nowX < plotWidth && (
							<rect
								x={chart.nowX}
								y={0}
								width={plotWidth - chart.nowX}
								height={CHART_HEIGHT}
								{...stylex.props(styles.future)}
							/>
						)}
						<GridLines
							plotWidth={plotWidth}
							ticks={chart.yTicks}
							step={chart.yStep}
						/>
						<path
							d={chart.area}
							{...stylex.props(
								styles.area,
								live.isAlive ? styles[`${tone}Area`] : styles.offArea,
							)}
						/>
						<LockedLine
							width={plotWidth}
							y={chart.lockedY}
							tagX={0}
							label={`locked at ${plain.format(guess.priceAtGuess)}`}
						/>
						<path
							d={chart.line}
							{...stylex.props(
								styles.line,
								live.isAlive ? styles[`${tone}Line`] : styles.offLine,
							)}
						/>
						{chart.points.length > 1 && (
							<>
								<circle
									cx={last.x}
									cy={last.y}
									r={5}
									{...stylex.props(
										live.isAlive ? styles[`${tone}Dot`] : styles.offDot,
									)}
								/>
								{current && live.isAlive && !point && (
									<PointTag
										width={plotWidth}
										x={last.x}
										y={last.y}
										tone={tone}
										label={`${standingPhrase(current.margin)} · provisional`}
									/>
								)}
							</>
						)}
						{point && <Crosshair x={point.x} y={point.y} />}
					</svg>
				) : (
					<Skeleton width="100%" height={CHART_HEIGHT} />
				)}
				{point && (
					<ReadoutTip
						readout={sampleReadout(point, guess)}
						x={point.x}
						width={plotWidth}
					/>
				)}
				{chart && (
					<Inspector
						xs={chart.points.map((p) => p.x)}
						times={times}
						inspection={inspected}
						onInspect={setInspected}
						label="This guess, second by second"
						valueText={(i) => sampleReadout(chart.points[i], guess).text}
					/>
				)}
				{!live.isAlive && (
					<p {...stylex.props(styles.note)}>
						{live.price === null
							? 'Connecting to the live price...'
							: 'Reconnecting to the live price...'}
					</p>
				)}
			</div>
			<Axis
				ticks={[
					{
						at: 0,
						label: 'guess',
					},
					{
						at: 0.25,
						label: `+${Math.round(totalSeconds * 0.25)}s`,
					},
					{
						at: 0.5,
						label: `+${Math.round(totalSeconds * 0.5)}s`,
					},
					{
						at: 0.75,
						label: `+${Math.round(totalSeconds * 0.75)}s`,
					},
					{
						at: 1,
						label: `+${totalSeconds}s`,
					},
				]}
			/>
		</div>
	);
}
