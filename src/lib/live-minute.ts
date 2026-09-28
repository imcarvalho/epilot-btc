/**
 * The live minute (engineering spec §5.1, product spec §6.1): while a guess
 * is in play, the chart can show the minute itself, one point per second
 * against the locked price, drawn from the game price the stream sends.
 *
 * It cannot affect the outcome, by construction: the browser only draws
 * these prices. A guess settles against the trade at its deadline (§3),
 * which is why everything drawn here is labelled provisional.
 *
 * All pure, so the tests need no stream.
 */

import type { Direction } from './resolve-guess';
import { GUESS_WINDOW_MS } from './resolve-guess';
import { niceTicks, type YTick } from './axis';

export interface Sample {
	/** Epoch ms, server clock. */
	t: number;
	price: number;
}

/** Enough for five minutes of waiting on an unchanged price. */
const MAX_SAMPLES = 300;

/**
 * One point per price: the stream sends the game price once a second, so a
 * minute is sixty points (§5.1). A point is only added for a new price
 * observation; the caller passes when that price stood as `t`.
 */
export function takeSample(
	samples: Sample[],
	latest: number | null,
	t: number,
	since: number,
): Sample[] {
	if (latest === null) {
		return samples;
	}
	const next = [
		...samples.filter((s) => s.t >= since),
		{
			t,
			price: latest,
		},
	];
	return next.length > MAX_SAMPLES
		? next.slice(next.length - MAX_SAMPLES)
		: next;
}

/** How the guess stands right now: `margin` is positive when it is winning. */
export function standing(
	direction: Direction,
	locked: number,
	current: number,
): { margin: number; ahead: boolean | null } {
	const margin = direction === 'up' ? current - locked : locked - current;
	return {
		margin,
		ahead: margin > 0 ? true : margin < 0 ? false : null,
	};
}

export interface MinuteChartSize {
	width: number;
	height: number;
	/** When the guess was locked, server clock. The x-axis starts here. */
	start: number;
	lockedPrice: number;
	/** Server clock now: the shaded remainder of the minute starts here. */
	now: number;
	padding?: number;
}

export interface MinuteChart {
	line: string;
	/** The line closed back to the locked price: the margin, shaded. */
	area: string;
	/** The seed at the locked price, then one per sample: where, and what. */
	points: { x: number; y: number; t: number; price: number }[];
	lockedY: number;
	nowX: number;
	/** A minute after the guess, or later while it waits for a move. */
	windowEnd: number;
	yFor: (price: number) => number;
	/** The price axis: round prices inside the range, and where they sit. */
	yTicks: YTick[];
	/** Their spacing, which decides how many decimals a label needs. */
	yStep: number;
}

/** Smallest vertical range drawn, so a quiet minute is not blown up into drama. */
const MIN_SPAN = 2;

export function buildMinuteChart(
	samples: Sample[],
	{ width, height, start, lockedPrice, now, padding = 12 }: MinuteChartSize,
): MinuteChart {
	const windowEnd = Math.max(start + GUESS_WINDOW_MS, now);
	const xFor = (t: number) => ((t - start) / (windowEnd - start)) * width;

	const prices = [lockedPrice, ...samples.map((s) => s.price)];
	let lo = Math.min(...prices);
	let hi = Math.max(...prices);
	if (hi - lo < MIN_SPAN) {
		const mid = (hi + lo) / 2;
		lo = mid - MIN_SPAN / 2;
		hi = mid + MIN_SPAN / 2;
	}
	const inner = height - 2 * padding;
	const yFor = (price: number) => padding + ((hi - price) / (hi - lo)) * inner;
	const lockedY = r(yFor(lockedPrice));

	// The line starts where the guess did: at the locked price, at t = 0.
	const points = [
		{
			x: 0,
			y: lockedY,
			t: start,
			price: lockedPrice,
		},
		...samples
			.filter((s) => s.t > start)
			.map((s) => ({
				x: r(xFor(s.t)),
				y: r(yFor(s.price)),
				...s,
			})),
	];

	const line = points
		.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
		.join('');
	const last = points[points.length - 1];
	const area = `${line}L${last.x} ${lockedY}L0 ${lockedY}Z`;

	const ticks = niceTicks(lo, hi);
	return {
		line,
		area,
		points,
		lockedY,
		nowX: r(Math.min(width, Math.max(0, xFor(now)))),
		windowEnd,
		yFor,
		yTicks: ticks.values.map((value) => ({
			value,
			y: yFor(value),
		})),
		yStep: ticks.step,
	};
}

const r = (n: number) => Math.round(n * 100) / 100;
