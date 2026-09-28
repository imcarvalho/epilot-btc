import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { getState } from '@/lib/game';
import { SIGN_IN_COOKIE, signInOutcomeFromCookie } from '@/lib/identity';
import { error, json, playerIdFrom } from '../respond';

/**
 * The player's whole game state, and the normal resolution path (engineering
 * spec §3): a pending guess that the server's own price can settle is settled
 * here, before responding. The client decides when to ask (§3.1); it never
 * decides the answer.
 *
 * Just after sign-in it also reports, once, what the sign-in did with this
 * browser's anonymous player (§6.2), so the screen can say so.
 */
export async function GET(request: NextRequest) {
	const playerId = await playerIdFrom(request);
	if (!playerId) return error('no-player', 401);

	const state = await getState(getDeps(), playerId);
	if (!state) return error('no-player', 401);

	const signIn = state.signedIn
		? signInOutcomeFromCookie(request.cookies.get(SIGN_IN_COOKIE)?.value)
		: null;
	const response = json({ ...state, signIn });
	if (request.cookies.has(SIGN_IN_COOKIE))
		response.cookies.delete(SIGN_IN_COOKIE);
	return response;
}
