/**
 * An in-memory GameStore with the same conditional semantics as the DynamoDB
 * one: each method checks its condition and writes in one synchronous step,
 * which is what DynamoDB guarantees per item. Every method awaits before
 * touching state, so concurrent callers genuinely interleave and races in the
 * game logic show up in tests.
 *
 * The DynamoDB store's own tests check that its expressions encode these same
 * conditions; this file is what lets the game logic be tested on top of them.
 */

import type { PendingGuess } from '../contracts';
import type { Scoreboard } from '../scoring';
import type { RateSlot } from '../rate-limit';
import type {
	BoardEntry,
	CachedCandles,
	CachedPodium,
	CachedPrice,
	GameStore,
	PlayerRecord,
	StartGuessResult,
	StreamSlot,
} from '../store';

const tick = () => new Promise<void>((r) => setImmediate(r));

export class MemoryStore implements GameStore {
	players = new Map<string, PlayerRecord>();
	price: CachedPrice | null = null;
	podium: CachedPodium | null = null;
	candles: CachedCandles | null = null;
	settleWrites = 0;
	boardQueries = 0;
	/**
	 * The board total, kept as DynamoDB keeps it: a counter moved by the
	 * sign-in transaction, not derived from the players on the board. A test
	 * that counts a player twice, or not at all, sees the counter be wrong.
	 */
	boardTotal = 0;
	/**
	 * How many sign-in transactions are cancelled by a conflict before one
	 * may land, as DynamoDB cancels one that touches an item another is
	 * writing. Nothing is written by a cancelled one.
	 */
	signInConflicts = 0;
	/** Spent stream ticket ids. */
	spentTickets = new Set<string>();
	/** Stream leases by "playerId#slot": the holder and when its lease runs out. */
	streamLeases = new Map<string, { streamId: string; leaseUntil: number }>();

	async getPlayer(playerId: string) {
		await tick();
		const player = this.players.get(playerId);
		return player ? structuredClone(player) : null;
	}

	async createPlayer(player: PlayerRecord) {
		await tick();
		if (this.players.has(player.playerId)) {
			return false;
		}
		this.players.set(player.playerId, structuredClone(player));
		return true;
	}

	async createSignedInPlayer(
		player: PlayerRecord,
		replacing: PlayerRecord | null,
		counted = false,
	) {
		await tick();
		if (this.signInConflicts > 0) {
			this.signInConflicts--;
			return false;
		}
		if (this.players.has(player.playerId)) {
			return false;
		}
		if (replacing) {
			const current = this.players.get(replacing.playerId);
			if (
				!current ||
				current.updatedAt !== replacing.updatedAt ||
				current.pendingGuess?.id !== replacing.pendingGuess?.id
			) {
				return false;
			}
			this.players.delete(replacing.playerId);
		}
		this.players.set(player.playerId, structuredClone(player));
		if (!counted) {
			this.boardTotal++;
		}
		return true;
	}

	async startGuess(
		playerId: string,
		guess: PendingGuess,
		now: number,
	): Promise<StartGuessResult> {
		await tick();
		const player = this.players.get(playerId);
		if (!player) {
			return 'no-player';
		}
		if (player.pendingGuess) {
			return 'guess-pending';
		}
		player.pendingGuess = structuredClone(guess);
		player.updatedAt = now;
		return 'started';
	}

	async settleGuess(
		playerId: string,
		guessId: string,
		board: Scoreboard,
		now: number,
	) {
		await tick();
		const player = this.players.get(playerId);
		if (!player || player.pendingGuess?.id !== guessId) {
			return false;
		}
		Object.assign(player, structuredClone(board), {
			pendingGuess: null,
			updatedAt: now,
		});
		this.settleWrites++;
		return true;
	}

	async listDueGuesses(cutoff: number, limit: number) {
		await tick();
		return [...this.players.values()]
			.filter((p) => p.pendingGuess && p.pendingGuess.createdAt <= cutoff)
			.sort((a, b) => a.pendingGuess!.createdAt - b.pendingGuess!.createdAt)
			.slice(0, limit)
			.map((p) => structuredClone(p));
	}

	/** Rate-limit counters by key, as DynamoDB holds them: `takeSlot` is one atomic step. */
	slots = new Map<string, number>();

	async takeSlot({ key, limit }: RateSlot) {
		await tick();
		const count = this.slots.get(key) ?? 0;
		if (count >= limit) {
			return false;
		}
		this.slots.set(key, count + 1);
		return true;
	}

	async getCachedPrice() {
		await tick();
		return this.price
			? {
					...this.price,
				}
			: null;
	}

	async putCachedPrice(price: CachedPrice) {
		await tick();
		if (this.price && this.price.updatedAt >= price.updatedAt) {
			return;
		}
		this.price = {
			...price,
		};
	}

	private board(): BoardEntry[] {
		return [...this.players.values()]
			.filter((p) => p.onBoard)
			.map(({ playerId, publicName, score, wins, losses }) => ({
				playerId,
				publicName,
				score,
				wins,
				losses,
			}));
	}

	async listTopOfBoard(limit: number) {
		await tick();
		this.boardQueries++;
		return this.board()
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}

	async countAboveOnBoard(score: number) {
		await tick();
		this.boardQueries++;
		return this.board().filter((e) => e.score > score).length;
	}

	async getBoardTotal() {
		await tick();
		return this.boardTotal;
	}

	async getCachedPodium() {
		await tick();
		return this.podium ? structuredClone(this.podium) : null;
	}

	async putCachedPodium(podium: CachedPodium) {
		await tick();
		this.podium = structuredClone(podium);
	}

	async getCachedCandles() {
		await tick();
		return this.candles ? structuredClone(this.candles) : null;
	}

	async putCachedCandles(candles: CachedCandles) {
		await tick();
		this.candles = structuredClone(candles);
	}

	async spendTicket(jti: string) {
		await tick();
		if (this.spentTickets.has(jti)) {
			return false;
		}
		this.spentTickets.add(jti);
		return true;
	}

	async claimStreamSlot(
		playerId: string,
		streamId: string,
		now: number,
		leaseMs: number,
		maxSlots: number,
	) {
		for (let slot = 0; slot < maxSlots; slot++) {
			await tick();
			const key = `${playerId}#${slot}`;
			const held = this.streamLeases.get(key);
			if (!held || held.leaseUntil < now) {
				this.streamLeases.set(key, {
					streamId,
					leaseUntil: now + leaseMs,
				});
				return slot;
			}
		}
		return null;
	}

	async renewStreamSlot(
		playerId: string,
		{ slot, streamId }: StreamSlot,
		now: number,
		leaseMs: number,
	) {
		await tick();
		const held = this.streamLeases.get(`${playerId}#${slot}`);
		if (held?.streamId !== streamId) {
			return false;
		}
		held.leaseUntil = now + leaseMs;
		return true;
	}

	async releaseStreamSlot(playerId: string, { slot, streamId }: StreamSlot) {
		await tick();
		const key = `${playerId}#${slot}`;
		if (this.streamLeases.get(key)?.streamId === streamId) {
			this.streamLeases.delete(key);
		}
	}
}

/**
 * The same table as seen from another runtime instance: the data is shared,
 * but the object is not, so what one process shares in memory (keyed by its
 * store) does not reach the other - as with two Lambdas on one table.
 */
export function fromAnotherInstance(store: MemoryStore): GameStore {
	return new Proxy(store, {
		get(target, key) {
			const value = Reflect.get(target, key);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
}
