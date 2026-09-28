/**
 * Engineering spec §3.1: the stream token names one player, cannot be forged
 * or altered, and stops working after a minute.
 */

import { createHmac } from 'node:crypto';
import {
	createStreamToken,
	STREAM_TOKEN_TTL_MS,
	verifyStreamToken,
} from './stream-token';

const SECRET = 'test-secret';
const T0 = 1_790_000_000_000;

describe('stream tokens', () => {
	it('carries the player id it was issued for', () => {
		const token = createStreamToken('anon:abc', SECRET, T0);
		expect(verifyStreamToken(token, SECRET, T0 + 1_000)).toBe('anon:abc');
	});

	it('expires after its lifetime', () => {
		const token = createStreamToken('anon:abc', SECRET, T0);
		expect(verifyStreamToken(token, SECRET, T0 + STREAM_TOKEN_TTL_MS - 1)).toBe(
			'anon:abc',
		);
		expect(
			verifyStreamToken(token, SECRET, T0 + STREAM_TOKEN_TTL_MS),
		).toBeNull();
	});

	it('is refused under another secret', () => {
		const token = createStreamToken('anon:abc', SECRET, T0);
		expect(verifyStreamToken(token, 'other-secret', T0)).toBeNull();
	});

	it('is refused when the player id is swapped', () => {
		const token = createStreamToken('anon:abc', SECRET, T0);
		const [, signature] = token.split('.');
		const forged = Buffer.from(
			JSON.stringify({
				p: 'google:someone-else',
				e: T0 + STREAM_TOKEN_TTL_MS,
			}),
		).toString('base64url');
		expect(verifyStreamToken(`${forged}.${signature}`, SECRET, T0)).toBeNull();
	});

	it('is refused when malformed, even if correctly signed', () => {
		const body = Buffer.from('not json').toString('base64url');
		const signature = createHmac('sha256', SECRET)
			.update(body)
			.digest('base64url');
		for (const token of ['', 'abc', 'a.b.c', `${body}.${signature}`]) {
			expect(verifyStreamToken(token, SECRET, T0)).toBeNull();
		}
	});
});
