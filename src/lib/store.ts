/**
 * What the game needs from storage, independent of DynamoDB.
 *
 * Engineering spec §2 ("Data model") and §4. Every method that must happen
 * once is conditional in the implementation, and says so in its return type:
 * a caller always learns whether its write was the one that counted.
 */

import type { PendingGuess } from './contracts';
import type { Candle } from './candles';
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

/** The last hour of one-minute candles, shared by every stream (§5). */
export interface CachedCandles {
	candles: Candle[];
	/** Epoch ms, server clock: when they were fetched from Coinbase. */
	updatedAt: number;
}

export interface CachedPrice {
	price: number;
	/** Epoch ms, server clock: when this price was fetched from Coinbase. */
	updatedAt: number;
}

export type StartGuessResult = 'started' | 'guess-pending' | 'no-player';

/** A held place among a player's live streams (§3.1). */
export interface StreamSlot {
	slot: number;
	streamId: string;
}

export interface GameStore {
	getPlayer(playerId: string): Promise<PlayerRecord | null>;

	/** Conditional on the id being unused. False if it already exists. */
	createPlayer(player: PlayerRecord): Promise<boolean>;

	/**
	 * First sign-in (§6.2): writes a signed-in player onto the board and
	 * counts them in the board total, in one transaction. With `replacing`,
	 * the same transaction deletes the anonymous record it was promoted from,
	 * conditioned on that record being unchanged since it was read - so a
	 * double click cannot merge twice, and a guess settling mid-merge is not
	 * lost. False, with nothing written, if any condition fails or another
	 * transaction was touching the same items: the caller reads and tries
	 * again.
	 *
	 * `counted` is for a record that vanished after being counted: it is
	 * written back without moving the total, which never goes down.
	 */
	createSignedInPlayer(
		player: PlayerRecord,
		replacing: PlayerRecord | null,
		counted?: boolean,
	): Promise<boolean>;

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

	getCachedCandles(): Promise<CachedCandles | null>;
	/** Last write wins: every writer fetched the same hour within seconds. */
	putCachedCandles(candles: CachedCandles): Promise<void>;

	/**
	 * Spends a stream ticket's id (§3.1): conditional on the id never having
	 * been spent. False if it was, which is a replay. `expiresAt` (epoch ms)
	 * only sets when DynamoDB may delete the record; a spent ticket is
	 * refused by its own expiry long before then.
	 */
	spendTicket(jti: string, expiresAt: number): Promise<boolean>;

	/**
	 * Takes one of a player's `maxSlots` live-stream places, for a lease of
	 * `leaseMs`: the first slot that is free or whose lease has run out, each
	 * taken with its own conditional write. The slot number, or null if all
	 * are held - the stream is refused.
	 */
	claimStreamSlot(
		playerId: string,
		streamId: string,
		now: number,
		leaseMs: number,
		maxSlots: number,
	): Promise<number | null>;

	/**
	 * Extends a lease, conditional on the slot still being this stream's.
	 * False means it was lost (it lapsed and another stream took it): the
	 * stream must end.
	 */
	renewStreamSlot(
		playerId: string,
		slot: StreamSlot,
		now: number,
		leaseMs: number,
	): Promise<boolean>;

	/** Frees a slot, conditional on it still being this stream's. Never throws for a lost slot. */
	releaseStreamSlot(playerId: string, slot: StreamSlot): Promise<void>;
}
