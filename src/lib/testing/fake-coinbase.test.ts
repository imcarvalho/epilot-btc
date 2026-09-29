/**
 * The fake Coinbase the accessibility tests run against (e2e/support/
 * fake-coinbase.mjs) is only useful if the app reads it like the real thing.
 * So it is read here by the app's own fetchers and their Zod schemas: if the
 * fake stops matching what the app expects, this fails in a second rather
 * than as a mystery in the browser tests.
 */

import { respond, priceAt } from '../../../e2e/support/fake-coinbase.mjs';
import { fetchHourCandles } from '../hour-candles';
import { fetchTickerPrice } from '../price';
import { fetchTape } from '../settlement';

const NOW = Date.UTC(2026, 8, 28, 12, 30, 20, 400);

/** A `fetch` that answers from the fake, at a fixed moment. */
const fake = (async (input: RequestInfo | URL) => {
	const url = new URL(String(input));
	const { status, body } = respond(`${url.pathname}${url.search}`, NOW);
	return new Response(JSON.stringify(body), {
		status,
	});
}) as typeof fetch;

describe('the fake Coinbase, read by the app', () => {
	it('gives a ticker the price fetcher accepts, at the market price', async () => {
		const quote = await fetchTickerPrice({
			fetchImpl: fake,
		});

		expect(quote).toEqual({
			price: priceAt(NOW),
			time: NOW,
		});
	});

	it('gives a hour of candles ending in the minute in progress', async () => {
		const candles = await fetchHourCandles(NOW, {
			fetchImpl: fake,
		});

		expect(candles.length).toBeGreaterThanOrEqual(60);
		const last = candles[candles.length - 1];
		expect(last.time).toBe(Math.floor(NOW / 60_000) * 60_000);
		expect(last.close).toBe(priceAt(NOW));
		for (const c of candles) {
			expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
			expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
		}
	});

	it('gives a tape reaching back past the point asked for, in time order', async () => {
		const from = NOW - 65_000;
		const tape = await fetchTape(from, {
			fetchImpl: fake,
		});

		expect(tape[0].time).toBeLessThanOrEqual(from);
		expect(tape[tape.length - 1].time).toBeLessThanOrEqual(NOW);
		expect(tape.map((p) => p.time)).toEqual(
			[...tape.map((p) => p.time)].sort((a, b) => a - b),
		);
		// The price at any moment is what the ticker and the candles say.
		const atFrom = tape.filter((p) => p.time <= from).at(-1)!;
		expect(atFrom.price).toBe(priceAt(Math.floor(from / 1000) * 1000));
	});

	it('pages trades backwards: `after` is the trade id to go before', () => {
		const ids = (query: string) =>
			(
				respond(`/products/BTC-USD/trades?${query}`, NOW).body as {
					trade_id: number;
				}[]
			).map((t) => t.trade_id);

		const newest = Math.floor(NOW / 1000);
		expect(ids('limit=3')).toEqual([newest, newest - 1, newest - 2]);
		expect(ids('limit=3&after=100')).toEqual([99, 98, 97]);
	});

	it('never sits near $1, where the tests lock their guesses', () => {
		for (let t = NOW; t < NOW + 3_600_000; t += 7_000) {
			expect(priceAt(t)).toBeGreaterThan(50_000);
		}
	});

	it('moves from second to second, so the live minute has something to draw', () => {
		const moved = new Set(
			Array.from(
				{
					length: 20,
				},
				(_, i) => priceAt(NOW + i * 1000),
			),
		);
		expect(moved.size).toBeGreaterThan(10);
	});

	describe('with a flat market (how a test holds a guess at "time is up")', () => {
		const market = {
			flatFrom: NOW - 90_000,
			price: 61_234.5,
		};
		const flat = (async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			const { status, body } = respond(
				`${url.pathname}${url.search}`,
				NOW,
				market,
			);
			return new Response(JSON.stringify(body), {
				status,
			});
		}) as typeof fetch;

		it('holds the price from then on, in the ticker, the tape and the candles alike', async () => {
			expect(priceAt(NOW, market)).toBe(61_234.5);
			expect(priceAt(NOW - 91_000, market)).toBe(priceAt(NOW - 91_000));

			const quote = await fetchTickerPrice({
				fetchImpl: flat,
			});
			expect(quote.price).toBe(61_234.5);

			const tape = await fetchTape(NOW - 65_000, {
				fetchImpl: flat,
			});
			expect(
				tape.filter((p) => p.time > market.flatFrom).length,
			).toBeGreaterThan(50);
			for (const point of tape.filter((p) => p.time > market.flatFrom)) {
				expect(point.price).toBe(61_234.5);
			}

			const candles = await fetchHourCandles(NOW, {
				fetchImpl: flat,
			});
			expect(candles.at(-1)).toMatchObject({
				open: 61_234.5,
				close: 61_234.5,
			});
		});
	});

	it('answers an unknown endpoint with 404, like the real one', () => {
		expect(respond('/products/BTC-USD/nope', NOW).status).toBe(404);
	});
});
