import type { SnapshotResponse } from './contracts';
import { getState, type GameDeps } from './game';
import { getHourCandles } from './hour-candles';
import { getLeaderboard } from './leaderboard';

/**
 * Everything one tick of the game stream says, as a single read (engineering
 * spec §3.1, "When the stream cannot be opened"). It is the same `getState`,
 * the same shared hour and the same board, so reading it settles a due guess
 * exactly as the stream's tick does; only the delivery differs.
 *
 * Null when the player no longer exists, like the stream's `gone`.
 */
export async function readSnapshot(
	deps: GameDeps,
	playerId: string,
): Promise<SnapshotResponse | null> {
	const [state, candles] = await Promise.all([
		getState(deps, playerId),
		getHourCandles(deps),
	]);
	if (!state) {
		return null;
	}
	return {
		state,
		candles: candles?.candles ?? null,
		leaderboard: await getLeaderboard(deps, playerId),
	};
}
