import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { createAnonymousPlayer, signIn } from '@/lib/game';
import {
	cookieValueFor,
	PLAYER_COOKIE,
	playerCookieOptions,
} from '@/lib/identity';
import { json, playerIdFrom } from '../respond';

/**
 * First contact (engineering spec §6.1): issues an anonymous player and sets
 * its id as an `httpOnly` cookie. Idempotent for a browser that already has
 * a live player, so calling it twice never forks one player into two.
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
		return json(
			{
				publicName: player!.publicName,
			},
			201,
		);
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
