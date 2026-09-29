/**
 * The ticket that lets a browser open the game stream.
 *
 * Engineering spec §3.1. The stream is served by a Lambda on its own domain,
 * so the identity cookie is not sent to it, and `EventSource` cannot set a
 * header. The page asks the web tier for a token instead (`GET
 * /api/stream-token`, which reads the cookie or the session as every route
 * does) and passes it in the stream's URL.
 *
 * A token carries the player id and an expiry, signed with HMAC-SHA256 under
 * a secret the two tiers share. It is short-lived because it travels in a
 * URL: it only has to survive until the stream opens, and a reconnect asks
 * for a new one.
 *
 * It is also single-use: it carries a random id (`jti`), and the stream
 * spends that id with a conditional write when it opens (`admitStream`), so
 * a ticket cannot open a second stream however many times it is replayed.
 * This file only signs and verifies; spending is the store's job.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** Long enough to open a stream, short enough that a leaked URL is stale. */
export const STREAM_TOKEN_TTL_MS = 60_000;

interface Payload {
	/** Player id. */
	p: string;
	/** Expiry, epoch ms. */
	e: number;
	/** Ticket id: random, spent once when a stream opens. */
	j: string;
}

/** What a valid ticket says. */
export interface StreamTicketClaims {
	playerId: string;
	jti: string;
	/** Epoch ms. */
	expiresAt: number;
}

function sign(body: string, secret: string): string {
	return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createStreamToken(
	playerId: string,
	secret: string,
	now: number,
	jti: string = randomUUID(),
): string {
	const payload: Payload = {
		p: playerId,
		e: now + STREAM_TOKEN_TTL_MS,
		j: jti,
	};
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${body}.${sign(body, secret)}`;
}

/** What a token says, or null if it is forged, malformed or expired. */
export function verifyStreamToken(
	token: string,
	secret: string,
	now: number,
): StreamTicketClaims | null {
	const [body, signature, extra] = token.split('.');
	if (!body || !signature || extra !== undefined) {
		return null;
	}

	const expected = Buffer.from(sign(body, secret));
	const given = Buffer.from(signature);
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		return null;
	}

	let payload: unknown;
	try {
		payload = JSON.parse(Buffer.from(body, 'base64url').toString());
	} catch {
		return null;
	}
	if (
		typeof payload !== 'object' ||
		payload === null ||
		typeof (payload as Payload).p !== 'string' ||
		typeof (payload as Payload).e !== 'number' ||
		typeof (payload as Payload).j !== 'string' ||
		(payload as Payload).j === ''
	) {
		return null;
	}
	const { p, e, j } = payload as Payload;
	return now < e
		? {
				playerId: p,
				jti: j,
				expiresAt: e,
			}
		: null;
}
