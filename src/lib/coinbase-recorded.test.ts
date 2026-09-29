/**
 * Coinbase's trades and candles, as they really arrive: recorded from the live
 * endpoints on 29 Sep 2026 and read by the app's own fetchers. The
 * accessibility tests run against a fake Coinbase, so this is what would
 * notice the real one changing shape (the ticker's recording is in
 * price.test.ts). A fake that we wrote cannot.
 */

import { fetchHourCandles } from './hour-candles';
import { fetchTape } from './settlement';

const json = (body: unknown) =>
	new Response(JSON.stringify(body), {
		headers: {
			'content-type': 'application/json',
		},
	});

// GET /products/BTC-USD/trades?limit=3, newest first.
const TRADES = [
	{
		trade_id: 1099915410,
		side: 'buy',
		size: '0.00000008',
		price: '83799.81000000',
		time: '2026-09-29T09:25:33.802066Z',
	},
	{
		trade_id: 1099915409,
		side: 'buy',
		size: '0.00000007',
		price: '83799.81000000',
		time: '2026-09-29T09:25:33.554810Z',
	},
	{
		trade_id: 1099915408,
		side: 'sell',
		size: '0.00014865',
		price: '83799.82000000',
		time: '2026-09-29T09:25:33.529631Z',
	},
];

// GET /products/BTC-USD/candles?granularity=60, newest first:
// [time (s), low, high, open, close, volume].
const CANDLES = [
	[1790673900, 83799.81, 83811, 83799.82, 83799.81, 0.15617043],
	[1790673840, 83759.51, 83799.82, 83759.51, 83799.81, 1.19316563],
	[1790673780, 83748.1, 83779.5, 83771.56, 83759.51, 0.68318015],
	[1790673720, 83770.96, 83806.36, 83803.56, 83771.55, 1.05989348],
];

describe('the recorded Coinbase responses', () => {
	it('trades: read into a tape in time order, prices as numbers, times to the microsecond dropped to ms', async () => {
		const tape = await fetchTape(Date.parse('2026-09-29T09:25:33.529631Z'), {
			fetchImpl: async () => json(TRADES),
		});

		expect(tape).toEqual([
			{
				time: Date.parse('2026-09-29T09:25:33.529Z'),
				price: 83799.82,
			},
			{
				time: Date.parse('2026-09-29T09:25:33.554Z'),
				price: 83799.81,
			},
			{
				time: Date.parse('2026-09-29T09:25:33.802Z'),
				price: 83799.81,
			},
		]);
	});

	it('candles: read oldest first, in ms, with open, high, low and close in the right places', async () => {
		const candles = await fetchHourCandles(1790673960_000, {
			fetchImpl: async () => json(CANDLES),
		});

		expect(candles.map((c) => c.time)).toEqual([
			1790673720_000, 1790673780_000, 1790673840_000, 1790673900_000,
		]);
		expect(candles[0]).toEqual({
			time: 1790673720_000,
			low: 83770.96,
			high: 83806.36,
			open: 83803.56,
			close: 83771.55,
		});
	});
});
