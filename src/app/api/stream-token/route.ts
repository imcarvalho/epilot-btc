import type { NextRequest } from 'next/server';
import type { StreamTicket } from '@/lib/contracts';
import { getDeps } from '@/lib/deps';
import { SIGN_IN_COOKIE, signInOutcomeFromCookie } from '@/lib/identity';
import { createStreamToken } from '@/lib/stream-token';
import { error, json, playerIdFrom } from '../respond';

/**
 * The ticket for the game stream (engineering spec §3.1). The stream lives
 * on its own domain, where this site's cookies do not go, so the player's
 * identity - read here from the session or the anonymous cookie, as every
 * route reads it - travels as a short-lived signed token instead.
 *
 * Just after sign-in it also reports, once, what the sign-in did with this
 * browser's anonymous player (§6.2), so the screen can say so: the stream
 * cannot, since the cookie that says it does not reach the stream's domain.
 *
 * `STREAM_URL` is the stream's address (the CDK stack's `StreamUrl` output)
 * and `STREAM_SECRET` the key both tiers sign with. Without them the stream
 * is off and this says so.
 */
export async function GET(request: NextRequest) {
	const playerId = await playerIdFrom(request);
	if (!playerId) {
		return error('no-player', 401);
	}

	const url = process.env.STREAM_URL;
	const secret = process.env.STREAM_SECRET;
	if (!url || !secret) {
		return error('stream-unavailable', 503);
	}

	const signIn = playerId.startsWith('google:')
		? signInOutcomeFromCookie(request.cookies.get(SIGN_IN_COOKIE)?.value)
		: null;
	const response = json<StreamTicket>({
		url,
		token: createStreamToken(playerId, secret, getDeps().now()),
		signIn,
	});
	if (request.cookies.has(SIGN_IN_COOKIE)) {
		response.cookies.delete(SIGN_IN_COOKIE);
	}
	return response;
}
