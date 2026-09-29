/**
 * A stand-in for Coinbase Exchange's BTC-USD ticker, trades and candles, for
 * the accessibility tests. The deploy gate used to call the live API: a
 * blip or a 429 from the build machine's shared IP blocked a deploy for a
 * reason that had nothing to do with the change. This serves the same
 * response shapes from a made-up market, so the gate depends only on this
 * repository.
 *
 * The market is a pure function of the time - `priceAt(ms)` - so the ticker,
 * the trades and the candles always agree with each other, and a test can
 * work out what any of them will say. A trade every second, a price that
 * moves by a few dollars from second to second and never sits at $1 (where
 * the tests lock their guesses, so any real price has moved from it).
 *
 * `respond` is pure and unit-tested against the app's own parsers
 * (src/lib/testing/fake-coinbase.test.ts); running this file starts it as an
 * HTTP server, which is how Playwright's `webServer` uses it.
 *
 * `E2E_LIVE_COINBASE=1 npm run test:a11y` skips it and calls the real API,
 * for the occasional check that the app still reads what Coinbase sends.
 */

import { createServer } from 'node:http';

const MINUTE_MS = 60_000;

/**
 * The market price at a moment, to the cent. A `market` with `flatFrom` and
 * `price` holds that price from that moment on: how a test keeps a guess at
 * "time is up", waiting for a price that never changes.
 */
export function priceAt(ms, market = {}) {
	if (market.flatFrom !== undefined && ms >= market.flatFrom) {
		return market.price;
	}
	const price = 60_000 + 30 * Math.sin(ms / 9_000) + 12 * Math.sin(ms / 2_300);
	return Math.round(price * 100) / 100;
}

const money = (n) => n.toFixed(2);

function trade(second, market) {
	return {
		time: new Date(second * 1000).toISOString(),
		trade_id: second,
		price: money(priceAt(second * 1000, market)),
		size: '0.00100000',
		side: second % 2 === 0 ? 'buy' : 'sell',
	};
}

function candle(minuteStart, now, market) {
	const end = Math.min(minuteStart + MINUTE_MS, now);
	let low = Infinity;
	let high = -Infinity;
	for (let t = minuteStart; t <= end; t += 5_000) {
		low = Math.min(low, priceAt(t, market));
		high = Math.max(high, priceAt(t, market));
	}
	const open = priceAt(minuteStart, market);
	const close = priceAt(end, market);
	low = Math.min(low, open, close);
	high = Math.max(high, open, close);
	return [minuteStart / 1000, low, high, open, close, 1.5];
}

/**
 * What Coinbase would answer for a request path and query, at time `now`:
 * `{ status, body }`. Trades and candles are newest first, as Coinbase sends
 * them; trades page backwards with `after` (the trade id to go before).
 */
export function respond(pathAndQuery, now, market = {}) {
	const url = new URL(pathAndQuery, 'http://fake-coinbase');
	const endpoint = url.pathname.match(/^\/products\/BTC-USD\/(\w+)$/)?.[1];

	if (endpoint === 'ticker') {
		const price = priceAt(now, market);
		return {
			status: 200,
			body: {
				trade_id: Math.floor(now / 1000),
				price: money(price),
				size: '0.00100000',
				time: new Date(now).toISOString(),
				bid: money(price - 0.01),
				ask: money(price + 0.01),
				volume: '10000.12345678',
			},
		};
	}

	if (endpoint === 'trades') {
		const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 1000);
		const after = url.searchParams.get('after');
		const newest = after === null ? Math.floor(now / 1000) : Number(after) - 1;
		return {
			status: 200,
			body: Array.from(
				{
					length: limit,
				},
				(_, i) => trade(newest - i, market),
			),
		};
	}

	if (endpoint === 'candles') {
		const start = Math.floor(
			Date.parse(url.searchParams.get('start') ?? '') / MINUTE_MS,
		);
		const end = Math.min(Date.parse(url.searchParams.get('end') ?? ''), now);
		const rows = [];
		for (let m = Math.floor(end / MINUTE_MS); m >= start; m--) {
			rows.push(candle(m * MINUTE_MS, now, market));
		}
		return {
			status: 200,
			body: rows,
		};
	}

	return {
		status: 404,
		body: {
			message: 'NotFound',
		},
	};
}

/**
 * Serves `respond` over HTTP; `GET /` answers 200 so a runner can tell it is
 * up. `POST /__control` with `{ flatFrom, price }` holds the market flat from
 * then on, and with `{}` lets it move again (e2e/support/market.ts).
 */
export function startFakeCoinbase(port) {
	let market = {};
	const server = createServer(async (req, res) => {
		if (req.url === '/') {
			res.end('fake coinbase');
			return;
		}
		if (req.url === '/__control' && req.method === 'POST') {
			let text = '';
			for await (const chunk of req) {
				text += chunk;
			}
			market = JSON.parse(text || '{}');
			res.end('ok');
			return;
		}
		const { status, body } = respond(req.url ?? '/', Date.now(), market);
		res.writeHead(status, {
			'content-type': 'application/json',
		});
		res.end(JSON.stringify(body));
	});
	return new Promise((resolve) => {
		server.listen(port, () => resolve(server));
	});
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.FAKE_COINBASE_PORT ?? 3102);
	await startFakeCoinbase(port);
	console.log(`fake coinbase on http://localhost:${port}`);
}
