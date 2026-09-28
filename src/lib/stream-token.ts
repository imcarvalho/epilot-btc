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
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Long enough to open a stream, short enough that a leaked URL is stale. */
export const STREAM_TOKEN_TTL_MS = 60_000;

interface Payload {
	/** Player id. */
	p: string;
	/** Expiry, epoch ms. */
	e: number;
}

function sign(body: string, secret: string): string {
	return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createStreamToken(
	playerId: string,
	secret: string,
	now: number,
): string {
	const payload: Payload = {
		p: playerId,
		e: now + STREAM_TOKEN_TTL_MS,
	};
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${body}.${sign(body, secret)}`;
}

/** The player id a token was issued for, or null if it is forged, malformed or expired. */
export function verifyStreamToken(
	token: string,
	secret: string,
	now: number,
): string | null {
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
		typeof (payload as Payload).e !== 'number'
	) {
		return null;
	}
	const { p, e } = payload as Payload;
	return now < e ? p : null;
}
