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
import type {
	BoardEntry,
	CachedPodium,
	CachedPrice,
	GameStore,
	PlayerRecord,
	StartGuessResult,
} from '../store';

const tick = () => new Promise<void>((r) => setImmediate(r));

export class MemoryStore implements GameStore {
	players = new Map<string, PlayerRecord>();
	price: CachedPrice | null = null;
	podium: CachedPodium | null = null;
	settleWrites = 0;
	boardQueries = 0;

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
	) {
		await tick();
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

	async getCachedPrice() {
		await tick();
		return this.price ? { ...this.price } : null;
	}

	async putCachedPrice(price: CachedPrice) {
		await tick();
		if (this.price && this.price.updatedAt >= price.updatedAt) {
			return;
		}
		this.price = { ...price };
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

	// The DynamoDB store keeps a counter; here the count is the same number.
	async getBoardTotal() {
		await tick();
		return this.board().length;
	}

	async getCachedPodium() {
		await tick();
		return this.podium ? structuredClone(this.podium) : null;
	}

	async putCachedPodium(podium: CachedPodium) {
		await tick();
		this.podium = structuredClone(podium);
	}
}
