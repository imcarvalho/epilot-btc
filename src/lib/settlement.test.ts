/**
 * Engineering spec §3 ("The price at the deadline"): a guess settles against
 * the market as it stood when its minute ran out, however late anyone asks.
 */

import {
	fetchTape,
	settleAgainstTape,
	TRADES_URL,
	type PricePoint,
} from './settlement';

const T0 = 1_700_000_000_000;
const DEADLINE = T0 + 60_000;

const up = {
	direction: 'up' as const,
	priceAtGuess: 100_000,
	createdAt: T0,
};

const at = (offset: number, price: number): PricePoint => ({
	time: DEADLINE + offset,
	price,
});

describe('settleAgainstTape', () => {
	it('settles against the last trade at or before the deadline', () => {
		expect(
			settleAgainstTape(up, [at(-3_000, 100_020), at(-1_000, 100_010)]),
		).toEqual({
			resolved: true,
			delta: 1,
			price: 100_010,
			at: DEADLINE,
		});
	});

	it('counts a trade exactly at the deadline', () => {
		expect(settleAgainstTape(up, [at(-1_000, 100_010), at(0, 99_990)])).toEqual(
			{
				resolved: true,
				delta: -1,
				price: 99_990,
				at: DEADLINE,
			},
		);
	});

	it('ignores every trade after the deadline once the price had moved', () => {
		const tape = [at(-500, 99_990), at(5_000, 100_500), at(30_000, 101_000)];
		expect(settleAgainstTape(up, tape)).toMatchObject({
			delta: -1,
			price: 99_990,
		});
	});

	it('waits for the first trade that moves an unchanged price (R4)', () => {
		const tape = [at(-500, 100_000), at(2_000, 100_000), at(4_000, 100_030)];
		expect(settleAgainstTape(up, tape)).toEqual({
			resolved: true,
			delta: 1,
			price: 100_030,
			at: DEADLINE + 4_000,
		});
	});

	it('stays in play while nothing has moved the price', () => {
		expect(
			settleAgainstTape(up, [at(-500, 100_000), at(2_000, 100_000)]),
		).toEqual({
			resolved: false,
		});
	});

	it('settles nothing on a tape that does not reach back to the deadline', () => {
		expect(settleAgainstTape(up, [at(1_000, 100_500)])).toEqual({
			resolved: false,
		});
	});
});

/** A fake Coinbase: trades newest first, paged by `after`; candles by range. */
function coinbase(trades: { id: number; time: number; price: number }[]) {
	const newestFirst = [...trades].sort((a, b) => b.id - a.id);
	const calls: string[] = [];
	const fetchImpl = vi.fn(async (input: string | URL | Request) => {
		const url = new URL(String(input));
		calls.push(url.pathname + url.search);
		if (url.pathname.endsWith('/candles')) {
			// [time (s), low, high, open, close, volume], newest first.
			return Response.json([
				[(DEADLINE - 60_000) / 1000, 1, 1, 100_000, 100_005, 1],
				[(DEADLINE - 120_000) / 1000, 1, 1, 99_990, 100_000, 1],
			]);
		}
		const limit = Number(url.searchParams.get('limit'));
		const after = url.searchParams.get('after');
		const page = newestFirst
			.filter((t) => after === null || t.id < Number(after))
			.slice(0, limit);
		return Response.json(
			page.map((t) => ({
				trade_id: t.id,
				price: String(t.price),
				time: new Date(t.time).toISOString(),
				size: '0.1',
				side: 'buy',
			})),
		);
	});
	return {
		fetchImpl: fetchImpl as unknown as typeof fetch,
		calls,
	};
}

describe('fetchTape', () => {
	it('returns the trades from the last one at or before `from`, oldest first', async () => {
		const { fetchImpl, calls } = coinbase([
			{
				id: 1,
				time: DEADLINE - 2_000,
				price: 100_010,
			},
			{
				id: 2,
				time: DEADLINE + 1_000,
				price: 100_020,
			},
		]);

		await expect(
			fetchTape(DEADLINE, {
				fetchImpl,
			}),
		).resolves.toEqual([
			{
				time: DEADLINE - 2_000,
				price: 100_010,
			},
			{
				time: DEADLINE + 1_000,
				price: 100_020,
			},
		]);
		expect(calls).toEqual(['/products/BTC-USD/trades?limit=1000']);
		expect(TRADES_URL).toContain('api.exchange.coinbase.com');
	});

	it('pages back through older trades until it reaches `from`', async () => {
		const trades = Array.from(
			{
				length: 2_500,
			},
			(_, i) => ({
				id: i + 1,
				time: DEADLINE - 1_000 + i,
				price: 100_000 + i,
			}),
		);
		const { fetchImpl, calls } = coinbase(trades);

		const tape = await fetchTape(DEADLINE, {
			fetchImpl,
		});
		expect(calls).toEqual([
			'/products/BTC-USD/trades?limit=1000',
			'/products/BTC-USD/trades?limit=1000&after=1501',
		]);
		expect(tape[0].time).toBeLessThanOrEqual(DEADLINE);
		expect(tape[tape.length - 1].price).toBe(102_499);
	});

	it('falls back to one-minute candles when the trades are out of reach', async () => {
		const trades = Array.from(
			{
				length: 3_000,
			},
			(_, i) => ({
				id: i + 1,
				time: DEADLINE + i,
				price: 100_000,
			}),
		);
		const { fetchImpl, calls } = coinbase(trades);

		const tape = await fetchTape(DEADLINE, {
			fetchImpl,
			maxPages: 2,
		});
		expect(calls[calls.length - 1]).toMatch(/^\/products\/BTC-USD\/candles\?/);
		expect(tape).toEqual([
			{
				time: DEADLINE - 120_000,
				price: 99_990,
			},
			{
				time: DEADLINE - 60_001,
				price: 100_000,
			},
			{
				time: DEADLINE - 60_000,
				price: 100_000,
			},
			{
				time: DEADLINE - 1,
				price: 100_005,
			},
		]);
	});

	it('throws when Coinbase answers with an error, so nothing settles', async () => {
		const fetchImpl = (async () =>
			new Response('busy', {
				status: 429,
			})) as unknown as typeof fetch;
		await expect(
			fetchTape(DEADLINE, {
				fetchImpl,
			}),
		).rejects.toThrow('Coinbase responded 429');
	});
});
