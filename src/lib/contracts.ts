/**
 * The API contract, defined once and imported by both halves.
 *
 * Engineering spec §1 and §2 ("API"). The browser sends two things: who it is
 * (a cookie, never a body field) and what it guesses. The guess body is a
 * strict object, so a request that tries to carry a price or a timestamp is
 * rejected at the boundary rather than silently ignored - the fairness rule
 * is visible in the contract itself, not only in the handler.
 */

import { z } from 'zod';
import type { Direction } from './resolve-guess';

export const GuessRequestSchema = z.strictObject({
	direction: z.enum(['up', 'down']),
});

export type GuessRequest = z.infer<typeof GuessRequestSchema>;

export interface PendingGuess {
	id: string;
	direction: Direction;
	/** Server-side price at the moment the guess was locked in. */
	priceAtGuess: number;
	/** Epoch ms, server clock. The countdown runs from here. */
	createdAt: number;
}

export interface ResolvedGuess extends PendingGuess {
	priceAtResolve: number;
	resolvedAt: number;
	delta: 1 | -1;
}

export interface Stats {
	wins: number;
	losses: number;
	/** Signed: +3 is three wins in a row, -2 is two losses in a row. */
	currentStreak: number;
	/**
	 * The streak just before the latest result, so a loss can read "streak
	 * ended at 2" rather than a bare -1. Stored, not derived: history is
	 * trimmed, and counters are never recomputed from it.
	 */
	previousStreak: number;
	bestStreak: number;
}

export interface StateResponse {
	publicName: string;
	score: number;
	stats: Stats;
	/** Null only if no price has ever been fetched. */
	price: number | null;
	priceUpdatedAt: number | null;
	/** True when the price is too old to resolve against (§3, 15 s). */
	priceStale: boolean;
	serverNow: number;
	pendingGuess: PendingGuess | null;
	/** The most recent resolution, newest first in `history` too. */
	lastResult: ResolvedGuess | null;
	history: ResolvedGuess[];
}

export interface GuessResponse {
	pendingGuess: PendingGuess;
	serverNow: number;
}

export type ApiErrorCode =
	| 'no-player'
	| 'invalid-request'
	| 'guess-pending'
	| 'price-unavailable'
	| 'unauthorized';

export interface ApiError {
	error: ApiErrorCode;
}
