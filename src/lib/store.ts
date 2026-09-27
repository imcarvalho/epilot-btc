/**
 * What the game needs from storage, independent of DynamoDB.
 *
 * Engineering spec §2 ("Data model") and §4. Every method that must happen
 * once is conditional in the implementation, and says so in its return type:
 * a caller always learns whether its write was the one that counted.
 */

import type { PendingGuess } from './contracts';
import type { Scoreboard } from './scoring';

export interface PlayerRecord extends Scoreboard {
	playerId: string;
	publicName: string;
	pendingGuess: PendingGuess | null;
	/**
	 * On the leaderboard: stored as the sparse `board` attribute, written only
	 * for signed-in players, so anonymous ones never enter the index (§6.4).
	 */
	onBoard: boolean;
	createdAt: number;
	updatedAt: number;
}

/** What the leaderboard index projects: exactly what a row needs (§6.4). */
export interface BoardEntry {
	playerId: string;
	publicName: string;
	score: number;
	wins: number;
	losses: number;
}

export interface CachedPodium {
	entries: BoardEntry[];
	/** Epoch ms, server clock. */
	updatedAt: number;
}

export interface CachedPrice {
	price: number;
	/** Epoch ms, server clock: when this price was fetched from Coinbase. */
	updatedAt: number;
}

export type StartGuessResult = 'started' | 'guess-pending' | 'no-player';

export interface GameStore {
	getPlayer(playerId: string): Promise<PlayerRecord | null>;

	/** Conditional on the id being unused. False if it already exists. */
	createPlayer(player: PlayerRecord): Promise<boolean>;

	/** Conditional on the player existing with no guess pending (rule R3). */
	startGuess(
		playerId: string,
		guess: PendingGuess,
		now: number,
	): Promise<StartGuessResult>;

	/**
	 * Writes a resolution, conditional on `guessId` still being the pending
	 * guess. True only for the one caller whose write landed; every other
	 * caller in a race gets false and has changed nothing.
	 */
	settleGuess(
		playerId: string,
		guessId: string,
		board: Scoreboard,
		now: number,
	): Promise<boolean>;

	/** Players whose pending guess was created at or before `cutoff`, from the sparse index (§3.2). */
	listDueGuesses(cutoff: number, limit: number): Promise<PlayerRecord[]>;

	getCachedPrice(): Promise<CachedPrice | null>;

	/** Never moves the cache backwards in time: an older write loses. */
	putCachedPrice(price: CachedPrice): Promise<void>;

	/** The best `limit` players on the board, best first, from the sparse index. */
	listTopOfBoard(limit: number): Promise<BoardEntry[]>;

	/** How many players on the board score strictly more than `score`. */
	countAboveOnBoard(score: number): Promise<number>;

	/** Players on the board, from a counter kept as they join (§6.4). */
	getBoardTotal(): Promise<number>;

	getCachedPodium(): Promise<CachedPodium | null>;
	putCachedPodium(podium: CachedPodium): Promise<void>;
}
