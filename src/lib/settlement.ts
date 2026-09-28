/**
 * Which price settles a guess.
 *
 * Engineering spec §3 ("The price at the deadline"). A guess settles against
 * the market as it stood when its minute ran out, read afterwards from
 * Coinbase Exchange's trade history - never against whatever the price is
 * when somebody happens to ask. So when a request arrives cannot change an
 * outcome: a player who waits, watching the ticker for a better moment,
 * gets exactly the answer they would have got at the deadline.
 *
 * The rule, over the trades in time order:
 * - the last trade at or before the deadline is the price at the deadline;
 * - if it equals the locked price, the guess stays in play (R4) and the first
 *   later trade at a different price settles it.
 *
 * `settleAgainstTape` is that rule, pure. `fetchTape` reads the trades from
 * the same market as the ticker, the chart and the live minute.
 */

import { z } from 'zod';
import { parseCandles, MINUTE_MS } from './candles';
import { GUESS_WINDOW_MS, resolveGuess, type Guess } from './resolve-guess';

/** One observed price on the market: a trade, or a candle's open or close. */
export interface PricePoint {
	/** Epoch ms, Coinbase's clock. */
	time: number;
	price: number;
}

export type Settlement =
	| { resolved: false }
	| {
			resolved: true;
			delta: 1 | -1;
			/** The trade the guess settled against. */
			price: number;
			/** When that price stood: the deadline, or the later trade that moved it. */
			at: number;
	  };

export function deadlineOf(guess: Pick<Guess, 'createdAt'>): number {
	return guess.createdAt + GUESS_WINDOW_MS;
}

/**
 * Settles a guess against a tape of prices in time order. The tape must reach
 * back to the deadline; one that does not settles nothing, since the price at
 * the deadline is then unknown.
 */
export function settleAgainstTape(
	guess: Guess,
	tape: PricePoint[],
): Settlement {
	const deadline = deadlineOf(guess);

	let anchor = -1;
	for (let i = 0; i < tape.length && tape[i].time <= deadline; i++) {
		anchor = i;
	}
	if (anchor === -1) {
		return {
			resolved: false,
		};
	}

	for (let i = anchor; i < tape.length; i++) {
		const { price, time } = tape[i];
		const at = Math.max(time, deadline);
		const outcome = resolveGuess(guess, price, at);
		if (outcome.resolved) {
			return {
				...outcome,
				price,
				at,
			};
		}
	}
	return {
		resolved: false,
	};
}

export const TRADES_URL =
	'https://api.exchange.coinbase.com/products/BTC-USD/trades';
const CANDLES_URL =
	'https://api.exchange.coinbase.com/products/BTC-USD/candles';

/** Coinbase's largest page of trades. */
const TRADE_PAGE = 1000;

/**
 * How far back trades are paged before falling back to candles. A page spans
 * a few minutes of BTC-USD, so this covers any guess the sweep is on time
 * for; the fallback is for recovering after an outage.
 */
export const MAX_TRADE_PAGES = 5;

/** Coinbase's largest page of candles: five hours of minutes. */
const CANDLE_PAGE = 300;

// Newest first: `{ trade_id, price, time, size, side }`.
const TradesSchema = z.array(
	z.object({
		trade_id: z.number(),
		price: z.string().regex(/^\d+(\.\d+)?$/),
		time: z.string(),
	}),
);

export class TapeFetchError extends Error {}

export interface FetchTapeOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	maxPages?: number;
}

async function getJson(
	url: string,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<unknown> {
	const res = await fetchImpl(url, {
		signal: AbortSignal.timeout(timeoutMs),
		cache: 'no-store',
	});
	if (!res.ok) {
		throw new TapeFetchError(`Coinbase responded ${res.status}`);
	}
	return res.json();
}

/**
 * The market from `from` to now, in time order, starting with the last trade
 * at or before `from`. Trades are paged back from the newest; if `from` is
 * further back than `maxPages` reach, one-minute candles stand in, each
 * minute read as its open at the start and its close at the end.
 */
export async function fetchTape(
	from: number,
	{
		fetchImpl = fetch,
		timeoutMs = 2_000,
		maxPages = MAX_TRADE_PAGES,
	}: FetchTapeOptions = {},
): Promise<PricePoint[]> {
	const newestFirst: PricePoint[] = [];
	let after: number | null = null;

	for (let page = 0; page < maxPages; page++) {
		const params = new URLSearchParams({
			limit: String(TRADE_PAGE),
		});
		if (after !== null) {
			params.set('after', String(after));
		}
		const rows = TradesSchema.parse(
			await getJson(`${TRADES_URL}?${params}`, fetchImpl, timeoutMs),
		);
		if (rows.length === 0) {
			break;
		}
		for (const row of rows) {
			newestFirst.push({
				time: Date.parse(row.time),
				price: Number(row.price),
			});
		}
		if (newestFirst[newestFirst.length - 1].time <= from) {
			return newestFirst.reverse();
		}
		after = rows[rows.length - 1].trade_id;
	}

	return fetchCandleTape(from, fetchImpl, timeoutMs);
}

async function fetchCandleTape(
	from: number,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<PricePoint[]> {
	// A few minutes before `from`, so a quiet minute with no candle still
	// leaves one at or before it.
	const start = Math.floor(from / MINUTE_MS) * MINUTE_MS - 5 * MINUTE_MS;
	const params = new URLSearchParams({
		granularity: '60',
		start: new Date(start).toISOString(),
		end: new Date(start + CANDLE_PAGE * MINUTE_MS).toISOString(),
	});
	const candles = parseCandles(
		await getJson(`${CANDLES_URL}?${params}`, fetchImpl, timeoutMs),
	);
	return candles.flatMap((c) => [
		{
			time: c.time,
			price: c.open,
		},
		{
			time: c.time + MINUTE_MS - 1,
			price: c.close,
		},
	]);
}
