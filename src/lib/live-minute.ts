/**
 * The live minute (engineering spec §5.1, product spec §6.1): while a guess
 * is in play, the chart can show the minute itself, drawn from Coinbase's
 * public ticker at one point per second against the locked price.
 *
 * It cannot affect the outcome, by construction: these prices never leave
 * the browser. Resolution reads the server's own cached price, which is why
 * everything drawn from them is labelled provisional.
 *
 * All pure: a fake feed drives the tests, and no test needs a socket.
 */

import { z } from 'zod';
import type { Direction } from './resolve-guess';
import { GUESS_WINDOW_MS } from './resolve-guess';

export const TICKER_URL = 'wss://ws-feed.exchange.coinbase.com';

export const TICKER_SUBSCRIBE = JSON.stringify({
	type: 'subscribe',
	product_ids: ['BTC-USD'],
	channels: ['ticker'],
});

export interface Sample {
	/** Epoch ms, server clock. */
	t: number;
	price: number;
}

const TickerSchema = z.object({
	type: z.literal('ticker'),
	product_id: z.literal('BTC-USD'),
	price: z.string().regex(/^\d+(\.\d+)?$/),
	time: z.string(),
});

/** A ticker message's price and time, or null for anything else on the feed. */
export function parseTicker(
	data: string,
): { price: number; time: number } | null {
	try {
		const parsed = TickerSchema.safeParse(JSON.parse(data));
		if (!parsed.success) {
			return null;
		}
		const time = Date.parse(parsed.data.time);
		return Number.isFinite(time)
			? {
					price: Number(parsed.data.price),
					time,
				}
			: null;
	} catch {
		return null;
	}
}

/** Enough for five minutes of waiting on an unchanged price. */
const MAX_SAMPLES = 300;

/**
 * One point per second: the socket's messages land in a buffer and a
 * one-second timer takes the latest (§5.1). BTC ticks several times a
 * second; sixty points make a legible line where every tick would be noise.
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

	return {
		line,
		area,
		points,
		lockedY,
		nowX: r(Math.min(width, Math.max(0, xFor(now)))),
		windowEnd,
		yFor,
	};
}

const r = (n: number) => Math.round(n * 100) / 100;
