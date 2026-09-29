/**
 * Engineering spec §3.1: the stream token names one player, cannot be forged
 * or altered, stops working after a minute, and carries a random id so that
 * it can be spent once.
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
		expect(verifyStreamToken(token, SECRET, T0 + 1_000)?.playerId).toBe(
			'anon:abc',
		);
	});

	it('expires after its lifetime', () => {
		const token = createStreamToken('anon:abc', SECRET, T0);
		expect(
			verifyStreamToken(token, SECRET, T0 + STREAM_TOKEN_TTL_MS - 1)?.playerId,
		).toBe('anon:abc');
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
				j: 'j1',
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

	it('carries a ticket id and its expiry', () => {
		const token = createStreamToken('anon:abc', SECRET, T0, 'ticket-1');
		expect(verifyStreamToken(token, SECRET, T0)).toEqual({
			playerId: 'anon:abc',
			jti: 'ticket-1',
			expiresAt: T0 + STREAM_TOKEN_TTL_MS,
		});
	});

	it('gives every ticket its own random id', () => {
		const ids = new Set(
			Array.from(
				{
					length: 50,
				},
				() =>
					verifyStreamToken(
						createStreamToken('anon:abc', SECRET, T0),
						SECRET,
						T0,
					)?.jti,
			),
		);
		expect(ids.size).toBe(50);
		expect(ids.has(undefined)).toBe(false);
	});

	it('is refused when the ticket id is swapped for another', () => {
		const [body, signature] = createStreamToken(
			'anon:abc',
			SECRET,
			T0,
			'ticket-1',
		).split('.');
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
		payload.j = 'ticket-2';
		const forged = Buffer.from(JSON.stringify(payload)).toString('base64url');
		expect(verifyStreamToken(`${forged}.${signature}`, SECRET, T0)).toBeNull();
	});

	it('is refused when it carries no ticket id, even if correctly signed', () => {
		for (const j of [undefined, '', 7]) {
			const body = Buffer.from(
				JSON.stringify({
					p: 'anon:abc',
					e: T0 + STREAM_TOKEN_TTL_MS,
					j,
				}),
			).toString('base64url');
			const signature = createHmac('sha256', SECRET)
				.update(body)
				.digest('base64url');
			expect(verifyStreamToken(`${body}.${signature}`, SECRET, T0)).toBeNull();
		}
	});
});
