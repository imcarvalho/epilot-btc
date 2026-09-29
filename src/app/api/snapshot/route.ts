import type { NextRequest } from 'next/server';
import type { SnapshotResponse } from '@/lib/contracts';
import { getDeps } from '@/lib/deps';
import { readSnapshot } from '@/lib/snapshot';
import { error, json, playerIdFrom } from '../respond';

/**
 * The screen's state in one read, for when the game stream cannot be opened
 * (engineering spec §3.1). The stream's Lambda shares the account's ten
 * concurrent executions, so at busy moments it answers 429; the client then
 * polls this instead. It runs on the web tier, whose concurrency is not that
 * of the stream, and it reads through the same `getState`, so a guess still
 * settles against the price at its deadline whenever it is read.
 *
 * 401 with no player, 404 when the player no longer exists (the stream's
 * `gone`).
 */
export async function GET(request: NextRequest) {
	const playerId = await playerIdFrom(request);
	if (!playerId) {
		return error('no-player', 401);
	}
	const snapshot = await readSnapshot(getDeps(), playerId);
	if (!snapshot) {
		return error('no-player', 404);
	}
	return json<SnapshotResponse>(snapshot);
}
