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
import type { Candle } from './candles';
import type { Direction } from './resolve-guess';

export const GuessRequestSchema = z.strictObject({
	direction: z.enum(['up', 'down']),
});

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
	/** Signed in with Google, so on the board and kept across devices. */
	signedIn: boolean;
}

/**
 * What first sign-in did with the browser's anonymous player (§6.2):
 *
 * - `promoted`: no account yet, so the anonymous record became it - score,
 *   counters, history and any pending guess - and the anonymous item is gone;
 * - `kept-existing`: the account already existed, so it wins and the
 *   anonymous record is left as it was (never summed: that would let anyone
 *   farm points in incognito windows and merge them in). The UI says so;
 * - `returning`: the account already existed and this browser had played
 *   nothing, so there is nothing to mention;
 * - `created`: no account and no anonymous player; a fresh one.
 */
export type SignInOutcome =
	'promoted' | 'kept-existing' | 'returning' | 'created';

/**
 * One row of the board (product spec §6.7): the same numbers as the player's
 * own scoreboard, under the generated name only - never a player id, never
 * a Google display name.
 */
export interface LeaderboardRow {
	/** Players on equal scores share a rank; the next rank skips. */
	rank: number;
	publicName: string;
	score: number;
	/** Whole percent, or null before the first result. */
	successRate: number | null;
	guesses: number;
	isYou: boolean;
}

export interface LeaderboardResponse {
	/** The top three, best first. */
	podium: LeaderboardRow[];
	/** The caller's own row when it is not already on the podium. */
	you: LeaderboardRow | null;
	/** How many players are on the board. */
	total: number;
	/** Whether the caller is on the board at all: signed-in players only. */
	isEligible: boolean;
}

export interface GuessResponse {
	pendingGuess: PendingGuess;
	serverNow: number;
}

/**
 * One event on the game stream (engineering spec §3.1), as a Server-Sent
 * Event whose `event:` field is the type and whose `data:` is the JSON.
 */
export type StreamEvent =
	| { type: 'state'; data: StateResponse }
	/** The last hour; null when there is none to show (Coinbase down, nothing cached). */
	| { type: 'candles'; data: Candle[] | null }
	| { type: 'leaderboard'; data: LeaderboardResponse }
	/** The player no longer exists (expired, or deleted): make a new one and reconnect. */
	| { type: 'gone'; data: null };

/** `GET /api/stream-token`: where the game stream is, and the ticket to open it. */
export interface StreamTicket {
	/** The stream's URL, without the token. */
	url: string;
	token: string;
	/** What a sign-in that has just happened did; reported once, then null. */
	signIn: SignInOutcome | null;
}

export type ApiErrorCode =
	| 'no-player'
	| 'invalid-request'
	| 'guess-pending'
	| 'price-unavailable'
	| 'stream-unavailable'
	| 'unauthorized';

export interface ApiError {
	error: ApiErrorCode;
}
