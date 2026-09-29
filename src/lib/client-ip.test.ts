import { clientIpFrom, hashIp } from './client-ip';

describe('clientIpFrom', () => {
	it('is null without a header, or with an empty one', () => {
		expect(clientIpFrom(null)).toBeNull();
		expect(clientIpFrom('')).toBeNull();
		expect(clientIpFrom(' , ')).toBeNull();
	});

	it('takes the last hop, the one the trusted proxy added', () => {
		expect(clientIpFrom('203.0.113.7')).toBe('203.0.113.7');
		expect(clientIpFrom('6.6.6.6, 203.0.113.7')).toBe('203.0.113.7');
		expect(clientIpFrom('6.6.6.6,7.7.7.7 , 203.0.113.7')).toBe('203.0.113.7');
	});

	it('ignores what the client put on the left, however much of it', () => {
		expect(clientIpFrom('1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7')).toBe(
			'203.0.113.7',
		);
	});

	it('counts further trusted proxies from the right', () => {
		expect(clientIpFrom('6.6.6.6, 203.0.113.7, 10.0.0.1', 2)).toBe(
			'203.0.113.7',
		);
	});

	it('is null if there are fewer hops than trusted proxies', () => {
		expect(clientIpFrom('203.0.113.7', 2)).toBeNull();
	});
});

describe('hashIp', () => {
	it('is stable, keyed, and does not contain the address', () => {
		const hash = hashIp('203.0.113.7', 'secret');
		expect(hashIp('203.0.113.7', 'secret')).toBe(hash);
		expect(hashIp('203.0.113.8', 'secret')).not.toBe(hash);
		expect(hashIp('203.0.113.7', 'other')).not.toBe(hash);
		expect(hash).toMatch(/^[0-9a-f]{32}$/);
	});
});
