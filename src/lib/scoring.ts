/**
 * What a resolution does to a player's record.
 *
 * Engineering spec §4: score, wins/losses, both streaks and the history move
 * in one write, and counters are never recomputed from `history` (which is
 * trimmed). This computes that write's values. Pure, so the streak rules are
 * tested without a table.
 */

import type { PendingGuess, ResolvedGuess, Stats } from './contracts';

export const HISTORY_LIMIT = 10;

export interface Scoreboard extends Stats {
	score: number;
	history: ResolvedGuess[];
}

export function nextStreak(current: number, delta: 1 | -1): number {
	if (delta === 1) return current > 0 ? current + 1 : 1;
	return current < 0 ? current - 1 : -1;
}

export function applyResolution(
	before: Scoreboard,
	guess: PendingGuess,
	priceAtResolve: number,
	resolvedAt: number,
	delta: 1 | -1,
): Scoreboard {
	const currentStreak = nextStreak(before.currentStreak, delta);
	const entry: ResolvedGuess = { ...guess, priceAtResolve, resolvedAt, delta };

	return {
		score: before.score + delta,
		wins: before.wins + (delta === 1 ? 1 : 0),
		losses: before.losses + (delta === -1 ? 1 : 0),
		currentStreak,
		bestStreak: Math.max(before.bestStreak, currentStreak),
		history: [entry, ...before.history].slice(0, HISTORY_LIMIT),
	};
}
