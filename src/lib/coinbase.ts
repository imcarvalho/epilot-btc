/**
 * Where Coinbase Exchange's BTC-USD endpoints are (engineering spec §5).
 *
 * `E2E_COINBASE_URL` is for the accessibility tests only: it points every
 * Coinbase call at a fake serving the same response shapes (e2e/support/
 * fake-coinbase.mjs), so the deploy gate does not depend on the live API
 * being up, un-throttled and reachable from the build machine. Never set it
 * anywhere a player reaches.
 */

const EXCHANGE = 'https://api.exchange.coinbase.com';

/** The URL of one BTC-USD endpoint: `ticker`, `trades` or `candles`. */
export function coinbaseUrl(endpoint: 'ticker' | 'trades' | 'candles') {
	const base = (process.env.E2E_COINBASE_URL || EXCHANGE).replace(/\/$/, '');
	return `${base}/products/BTC-USD/${endpoint}`;
}
