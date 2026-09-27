import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { createAnonymousPlayer } from '@/lib/game';
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

	const existingId = playerIdFrom(request);
	const existing = existingId ? await deps.store.getPlayer(existingId) : null;
	if (existing) return json({ publicName: existing.publicName });

	const player = await createAnonymousPlayer(deps);
	const response = json({ publicName: player.publicName }, 201);
	response.cookies.set(
		PLAYER_COOKIE,
		cookieValueFor(player.playerId),
		playerCookieOptions(),
	);
	return response;
}
