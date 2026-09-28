import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { getLeaderboard } from '@/lib/leaderboard';
import { json, playerIdFrom } from '../respond';

/**
 * The board (engineering spec §6.4): the top three, the caller's own ranked
 * row, and the total. Public - it answers without a player too, just with no
 * row of theirs - and it carries generated names only, never an id.
 */
export async function GET(request: NextRequest) {
	return json(await getLeaderboard(getDeps(), await playerIdFrom(request)));
}
