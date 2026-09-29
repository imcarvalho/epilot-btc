import { coinbaseUrl } from './coinbase';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('coinbaseUrl', () => {
	it('is Coinbase Exchange, for the BTC-USD product', () => {
		expect(coinbaseUrl('ticker')).toBe(
			'https://api.exchange.coinbase.com/products/BTC-USD/ticker',
		);
		expect(coinbaseUrl('trades')).toBe(
			'https://api.exchange.coinbase.com/products/BTC-USD/trades',
		);
		expect(coinbaseUrl('candles')).toBe(
			'https://api.exchange.coinbase.com/products/BTC-USD/candles',
		);
	});

	it('moves to another host when E2E_COINBASE_URL is set, for the accessibility tests only', () => {
		vi.stubEnv('E2E_COINBASE_URL', 'http://localhost:3102');

		expect(coinbaseUrl('ticker')).toBe(
			'http://localhost:3102/products/BTC-USD/ticker',
		);
	});

	it('ignores an empty E2E_COINBASE_URL, and a trailing slash', () => {
		vi.stubEnv('E2E_COINBASE_URL', '');
		expect(coinbaseUrl('ticker')).toContain('api.exchange.coinbase.com');

		vi.stubEnv('E2E_COINBASE_URL', 'http://localhost:3102/');
		expect(coinbaseUrl('ticker')).toBe(
			'http://localhost:3102/products/BTC-USD/ticker',
		);
	});
});
