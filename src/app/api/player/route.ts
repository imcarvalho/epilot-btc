import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { createAnonymousPlayer, signIn } from '@/lib/game';
import {
	cookieValueFor,
	PLAYER_COOKIE,
	playerCookieOptions,
} from '@/lib/identity';
import { clientIpFrom, hashIp } from '@/lib/client-ip';
import { PLAYER_CREATE_RATE, rateSlot } from '@/lib/rate-limit';
import { error, json, playerIdFrom } from '../respond';

/**
 * First contact (engineering spec §6.1): issues an anonymous player and sets
 * its id as an `httpOnly` cookie.
 *
 * Idempotent for a browser that already has a live player: calling it again
 * with that cookie returns the same player and creates nothing, and is never
 * counted against the per-IP limit. Two concurrent first visits with no
 * cookie are a different case and are not made idempotent: nothing links
 * them, so they legitimately create two players, and whichever response the
 * browser stores last (its Set-Cookie wins) is the player it keeps; the other
 * is orphaned and expires after 30 days. The client shares one in-flight
 * creation per tab, so this only happens across tabs.
 *
 * Creation - and only creation - is limited per client IP
 * (`PLAYER_CREATE_RATE`, §8): identities are free, so this is what stops one
 * machine minting them without bound.
 */
export async function POST(request: NextRequest) {
	const deps = getDeps();

	const existingId = await playerIdFrom(request);
	const existing = existingId ? await deps.store.getPlayer(existingId) : null;
	if (existing) {
		return json({
			publicName: existing.publicName,
		});
	}

	// A live session whose record is gone: recreate the account rather than
	// fall back to an anonymous player the session would never read.
	if (existingId?.startsWith('google:')) {
		await signIn(deps, existingId.slice('google:'.length), null, {
			rejoin: true,
		});
		const player = await deps.store.getPlayer(existingId);
		if (!player) {
			console.error(
				JSON.stringify({
					event: 'player-rejoin-missing',
				}),
			);
			return error('server-error', 500);
		}
		return json(
			{
				publicName: player.publicName,
			},
			201,
		);
	}

	// The forwarded address is only worth counting behind CloudFront. When the
	// app is served locally (LOCAL_STREAM, set by dev:local and the e2e
	// servers) Next fills the header in from the local socket, so every
	// caller would be one address and the tests would hit the limit.
	const ip = process.env.LOCAL_STREAM
		? null
		: clientIpFrom(
				request.headers.get('x-forwarded-for'),
				Number(process.env.TRUSTED_PROXY_HOPS) || 1,
			);
	// No address means nothing to count against.
	if (ip) {
		const subject = hashIp(
			ip,
			process.env.STREAM_SECRET ?? process.env.AUTH_SECRET ?? 'btc-guess',
		);
		const slot = rateSlot(PLAYER_CREATE_RATE, subject, deps.now());
		if (!(await deps.store.takeSlot(slot))) {
			console.error(
				JSON.stringify({
					event: 'player-create-limited',
				}),
			);
			return error('rate-limited', 429);
		}
	}

	const player = await createAnonymousPlayer(deps);
	const response = json(
		{
			publicName: player.publicName,
		},
		201,
	);
	response.cookies.set(
		PLAYER_COOKIE,
		cookieValueFor(player.playerId),
		playerCookieOptions(),
	);
	return response;
}
