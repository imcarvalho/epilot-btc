/**
 * The leaderboard (engineering spec §6.4, product spec §6.7): one global
 * board, the top three and you.
 *
 * Three reads, all from the sparse `byScore` index or a counter, never a
 * scan: the podium (the top three), the caller's rank (players scoring
 * strictly more, plus one - so equal scores share a rank for free), and the
 * total (a counter kept as players join). The podium is the same for
 * everyone, so it is cached for ten seconds; the caller's own row is theirs
 * alone and read live.
 *
 * Only signed-in players carry the `board` attribute, so anonymous players
 * are never on it: the rule lives in the data, not in a filter here.
 */

import type { LeaderboardResponse, LeaderboardRow } from './contracts';
import type { GameDeps } from './game';
import { successRate } from './stats';
import type { BoardEntry } from './store';

export const PODIUM_SIZE = 3;
export const PODIUM_CACHE_MS = 10_000;

function toRow(
	entry: BoardEntry,
	rank: number,
	callerId: string | null,
): LeaderboardRow {
	return {
		rank,
		publicName: entry.publicName,
		score: entry.score,
		successRate: successRate(entry),
		guesses: entry.wins + entry.losses,
		isYou: entry.playerId === callerId,
	};
}

async function podiumEntries({ store, now }: GameDeps): Promise<BoardEntry[]> {
	const cached = await store.getCachedPodium();
	if (cached && now() - cached.updatedAt < PODIUM_CACHE_MS) {
		return cached.entries;
	}
	const entries = await store.listTopOfBoard(PODIUM_SIZE);
	await store.putCachedPodium({
		entries,
		updatedAt: now(),
	});
	return entries;
}

/** `callerId` is null for a request without a player; the board is public. */
export async function getLeaderboard(
	deps: GameDeps,
	callerId: string | null,
): Promise<LeaderboardResponse> {
	const [entries, caller, total] = await Promise.all([
		podiumEntries(deps),
		callerId ? deps.store.getPlayer(callerId) : null,
		deps.store.getBoardTotal(),
	]);

	// Within the podium, rank is one plus how many rows score more.
	const podium = entries.map((e) =>
		toRow(e, 1 + entries.filter((o) => o.score > e.score).length, callerId),
	);

	const isEligible = caller?.onBoard ?? false;
	let you: LeaderboardRow | null = null;
	if (caller && isEligible && !podium.some((r) => r.isYou)) {
		const above = await deps.store.countAboveOnBoard(caller.score);
		you = toRow(caller, above + 1, callerId);
	}

	return {
		podium,
		you,
		total,
		isEligible,
	};
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export function ordinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	const suffix = teen
		? 'th'
		: ((
				{
					1: 'st',
					2: 'nd',
					3: 'rd',
				} as Record<number, string>
			)[n % 10] ?? 'th');
	return `${n}${suffix}`;
}

const PODIUM_WORDS = ['First', 'Second', 'Third'];

/** Product spec §7: "Second place. Nice." on the podium, "138th of 1,204." off it. */
export function placeSentence(rank: number, total: number): string {
	if (rank <= PODIUM_WORDS.length) {
		return `${PODIUM_WORDS[rank - 1]} place. Nice.`;
	}
	return `${ordinal(rank)} of ${total.toLocaleString('en-US')}.`;
}
