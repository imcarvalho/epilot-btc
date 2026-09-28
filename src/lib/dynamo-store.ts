/**
 * GameStore on DynamoDB: the Players table from infra/lib/btc-guess-stack.ts.
 *
 * Engineering spec §2 ("Data model"), §3.2 and §4. Every write that must
 * happen once is a conditional write, never a read-then-write:
 *
 * - a guess starts only if `pendingGuess` does not exist (rule R3);
 * - a guess settles only if `pendingGuess.id` is still the one resolved, so
 *   the loser of a race changes nothing.
 *
 * The settle write sets counters computed from the record read just before
 * it. That is safe because of the condition: the only write that moves the
 * counters is a settle, and it also removes the pending guess, so if the id
 * still matches, nothing has touched the counters since that read.
 *
 * `pendingBucket` + `pendingAt` are the sparse `byPending` index keys: set by
 * the write that starts a guess, removed by the one that settles it.
 *
 * Only anonymous players expire (§8). A signed-in player is on the board and
 * counted in its total, so letting TTL delete them would leave the counter
 * counting someone who is gone; they carry no `ttl` at all.
 */

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
	GetCommand,
	PutCommand,
	QueryCommand,
	TransactWriteCommand,
	UpdateCommand,
	type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { PendingGuess } from './contracts';
import type { Scoreboard } from './scoring';
import type {
	BoardEntry,
	CachedPodium,
	CachedPrice,
	GameStore,
	PlayerRecord,
	StartGuessResult,
} from './store';

export const PRICE_KEY = 'PRICE#BTCUSD';
export const BOARD_INDEX = 'byScore';
/** The one board: the partition key every eligible player shares (§6.4). */
export const BOARD = 'GLOBAL';
/** Counter item: players on the board, incremented as they join. */
export const BOARD_TOTAL_KEY = 'BOARD#GLOBAL';
/** Cache item: the podium, identical for everyone, kept for ten seconds. */
export const PODIUM_KEY = 'BOARD#PODIUM';
export const PENDING_INDEX = 'byPending';
export const PENDING_BUCKET = 'PENDING';

/** §8: inactive anonymous players expire after 30 days, refreshed on every write. */
const PLAYER_TTL_SECONDS = 30 * 24 * 60 * 60;
const ANON_PREFIX = 'anon:';

/** The expiry to write for this player, or null for one who never expires. */
function ttlFor(playerId: string, now: number): number | null {
	return playerId.startsWith(ANON_PREFIX)
		? Math.floor(now / 1000) + PLAYER_TTL_SECONDS
		: null;
}

// Several of these (`ttl`, `history`) are DynamoDB reserved words, so every
// attribute goes through a name placeholder rather than only the ones that
// happen to clash today.
const NAMES = {
	'#playerId': 'playerId',
	'#score': 'score',
	'#wins': 'wins',
	'#losses': 'losses',
	'#currentStreak': 'currentStreak',
	'#previousStreak': 'previousStreak',
	'#bestStreak': 'bestStreak',
	'#history': 'history',
	'#pendingGuess': 'pendingGuess',
	'#pendingAt': 'pendingAt',
	'#pendingBucket': 'pendingBucket',
	'#updatedAt': 'updatedAt',
	'#ttl': 'ttl',
	'#id': 'id',
};

function pick<K extends keyof typeof NAMES>(names: typeof NAMES, ...keys: K[]) {
	return Object.fromEntries(keys.map((k) => [k, names[k]]));
}

const SETTLE_NAMES = pick(
	NAMES,
	'#score',
	'#wins',
	'#losses',
	'#currentStreak',
	'#previousStreak',
	'#bestStreak',
	'#history',
	'#pendingGuess',
	'#pendingAt',
	'#pendingBucket',
	'#updatedAt',
	'#ttl',
	'#id',
);

const isConditionFailure = (
	error: unknown,
): error is ConditionalCheckFailedException =>
	error instanceof ConditionalCheckFailedException ||
	(error as { name?: string })?.name === 'ConditionalCheckFailedException';

/** A transaction cancelled because one of its conditions failed. */
const isTransactionConflict = (error: unknown) => {
	const e = error as {
		name?: string;
		CancellationReasons?: { Code?: string }[];
	};
	return (
		e?.name === 'TransactionCanceledException' &&
		(e.CancellationReasons ?? []).some(
			(r) => r.Code === 'ConditionalCheckFailed',
		)
	);
};

/** A player as a table item: the sparse index keys only where they apply. */
function toItem(player: PlayerRecord): Record<string, unknown> {
	const { pendingGuess, onBoard, ...rest } = player;
	const ttl = ttlFor(player.playerId, player.updatedAt);
	return {
		...rest,
		...(pendingGuess
			? {
					pendingGuess,
					pendingAt: pendingGuess.createdAt,
					pendingBucket: PENDING_BUCKET,
				}
			: {}),
		// Sparse: written only for a player on the board, so everyone else
		// stays out of the leaderboard index entirely.
		...(onBoard ? { board: BOARD } : {}),
		...(ttl === null ? {} : { ttl }),
	};
}

function toPlayer(item: Record<string, unknown>): PlayerRecord {
	return {
		playerId: item.playerId as string,
		publicName: item.publicName as string,
		score: item.score as number,
		wins: item.wins as number,
		losses: item.losses as number,
		currentStreak: item.currentStreak as number,
		// Absent on records written before the attribute existed.
		previousStreak: (item.previousStreak as number | undefined) ?? 0,
		bestStreak: item.bestStreak as number,
		history: (item.history as PlayerRecord['history']) ?? [],
		pendingGuess: (item.pendingGuess as PendingGuess | undefined) ?? null,
		onBoard: item.board === BOARD,
		createdAt: item.createdAt as number,
		updatedAt: item.updatedAt as number,
	};
}

export class DynamoStore implements GameStore {
	constructor(
		private readonly client: DynamoDBDocumentClient,
		private readonly tableName: string,
	) {}

	async getPlayer(playerId: string) {
		const { Item } = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { playerId },
				ConsistentRead: true,
			}),
		);
		return Item ? toPlayer(Item) : null;
	}

	async createPlayer(player: PlayerRecord) {
		try {
			await this.client.send(
				new PutCommand({
					TableName: this.tableName,
					Item: toItem(player),
					ConditionExpression: 'attribute_not_exists(#playerId)',
					ExpressionAttributeNames: { '#playerId': 'playerId' },
				}),
			);
			return true;
		} catch (error) {
			if (isConditionFailure(error)) return false;
			throw error;
		}
	}

	async createSignedInPlayer(
		player: PlayerRecord,
		replacing: PlayerRecord | null,
	) {
		try {
			await this.client.send(
				new TransactWriteCommand({
					TransactItems: [
						{
							Put: {
								TableName: this.tableName,
								Item: toItem({ ...player, onBoard: true }),
								ConditionExpression: 'attribute_not_exists(#playerId)',
								ExpressionAttributeNames: { '#playerId': 'playerId' },
							},
						},
						...(replacing
							? [
									{
										Delete: {
											TableName: this.tableName,
											Key: { playerId: replacing.playerId },
											// Unchanged since it was read: the only writes to an
											// anonymous record start or settle a guess, and both
											// change the pending guess and `updatedAt`.
											ConditionExpression: replacing.pendingGuess
												? '#updatedAt = :updatedAt AND #pendingGuess.#id = :guessId'
												: '#updatedAt = :updatedAt AND attribute_not_exists(#pendingGuess)',
											ExpressionAttributeNames: {
												'#updatedAt': 'updatedAt',
												'#pendingGuess': 'pendingGuess',
												...(replacing.pendingGuess ? { '#id': 'id' } : {}),
											},
											ExpressionAttributeValues: {
												':updatedAt': replacing.updatedAt,
												...(replacing.pendingGuess
													? { ':guessId': replacing.pendingGuess.id }
													: {}),
											},
										},
									},
								]
							: []),
						{
							Update: {
								TableName: this.tableName,
								Key: { playerId: BOARD_TOTAL_KEY },
								UpdateExpression: 'ADD #total :one',
								ExpressionAttributeNames: { '#total': 'total' },
								ExpressionAttributeValues: { ':one': 1 },
							},
						},
					],
				}),
			);
			return true;
		} catch (error) {
			if (isTransactionConflict(error)) return false;
			throw error;
		}
	}

	async startGuess(
		playerId: string,
		guess: PendingGuess,
		now: number,
	): Promise<StartGuessResult> {
		const ttl = ttlFor(playerId, now);
		try {
			await this.client.send(
				new UpdateCommand({
					TableName: this.tableName,
					Key: { playerId },
					UpdateExpression:
						'SET #pendingGuess = :guess, #pendingAt = :pendingAt, #pendingBucket = :bucket, #updatedAt = :now' +
						(ttl === null ? '' : ', #ttl = :ttl'),
					ConditionExpression:
						'attribute_exists(#playerId) AND attribute_not_exists(#pendingGuess)',
					ExpressionAttributeNames: pick(
						NAMES,
						'#playerId',
						'#pendingGuess',
						'#pendingAt',
						'#pendingBucket',
						'#updatedAt',
						...(ttl === null ? [] : (['#ttl'] as const)),
					),
					ExpressionAttributeValues: {
						':guess': guess,
						':pendingAt': guess.createdAt,
						':bucket': PENDING_BUCKET,
						':now': now,
						...(ttl === null ? {} : { ':ttl': ttl }),
					},
					// Tells the two failure cases apart without a second read: an item
					// came back, so the player exists and it was the pending guess.
					ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
				}),
			);
			return 'started';
		} catch (error) {
			if (isConditionFailure(error))
				return error.Item ? 'guess-pending' : 'no-player';
			throw error;
		}
	}

	async settleGuess(
		playerId: string,
		guessId: string,
		board: Scoreboard,
		now: number,
	) {
		const ttl = ttlFor(playerId, now);
		const { '#ttl': _, ...namesWithoutTtl } = SETTLE_NAMES;
		try {
			await this.client.send(
				new UpdateCommand({
					TableName: this.tableName,
					Key: { playerId },
					UpdateExpression:
						'SET #score = :score, #wins = :wins, #losses = :losses, #currentStreak = :currentStreak, ' +
						'#previousStreak = :previousStreak, #bestStreak = :bestStreak, #history = :history, ' +
						'#updatedAt = :now' +
						(ttl === null ? ' ' : ', #ttl = :ttl ') +
						'REMOVE #pendingGuess, #pendingAt, #pendingBucket',
					ConditionExpression: '#pendingGuess.#id = :guessId',
					ExpressionAttributeNames:
						ttl === null ? namesWithoutTtl : SETTLE_NAMES,
					ExpressionAttributeValues: {
						':score': board.score,
						':wins': board.wins,
						':losses': board.losses,
						':currentStreak': board.currentStreak,
						':previousStreak': board.previousStreak,
						':bestStreak': board.bestStreak,
						':history': board.history,
						':now': now,
						...(ttl === null ? {} : { ':ttl': ttl }),
						':guessId': guessId,
					},
				}),
			);
			return true;
		} catch (error) {
			if (isConditionFailure(error)) return false;
			throw error;
		}
	}

	async listDueGuesses(cutoff: number, limit: number) {
		// The index is eventually consistent, so an item here may already be
		// settled in the table. That costs one failed conditional write, never a
		// second resolution.
		const { Items = [] } = await this.client.send(
			new QueryCommand({
				TableName: this.tableName,
				IndexName: PENDING_INDEX,
				KeyConditionExpression:
					'#pendingBucket = :bucket AND #pendingAt <= :cutoff',
				ExpressionAttributeNames: pick(NAMES, '#pendingBucket', '#pendingAt'),
				ExpressionAttributeValues: {
					':bucket': PENDING_BUCKET,
					':cutoff': cutoff,
				},
				Limit: limit,
			}),
		);
		return Items.map(toPlayer);
	}

	async getCachedPrice() {
		const { Item } = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { playerId: PRICE_KEY },
				ConsistentRead: true,
			}),
		);
		return Item
			? { price: Item.price as number, updatedAt: Item.updatedAt as number }
			: null;
	}

	async putCachedPrice({ price, updatedAt }: CachedPrice) {
		// No `ttl` on this item: DynamoDB expiry is lazy (hours, not seconds), so
		// freshness is judged by `updatedAt`, and deleting the item would only
		// lose the last-known price the game falls back on (§5, "Failure").
		try {
			await this.client.send(
				new PutCommand({
					TableName: this.tableName,
					Item: { playerId: PRICE_KEY, price, updatedAt },
					ConditionExpression:
						'attribute_not_exists(#updatedAt) OR #updatedAt < :updatedAt',
					ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
					ExpressionAttributeValues: { ':updatedAt': updatedAt },
				}),
			);
		} catch (error) {
			// Another instance cached a newer price first. Theirs stands.
			if (!isConditionFailure(error)) throw error;
		}
	}

	async listTopOfBoard(limit: number): Promise<BoardEntry[]> {
		const { Items = [] } = await this.client.send(
			new QueryCommand({
				TableName: this.tableName,
				IndexName: BOARD_INDEX,
				KeyConditionExpression: '#board = :board',
				ExpressionAttributeNames: { '#board': 'board' },
				ExpressionAttributeValues: { ':board': BOARD },
				ScanIndexForward: false,
				Limit: limit,
			}),
		);
		return Items.map((item) => ({
			playerId: item.playerId as string,
			publicName: item.publicName as string,
			score: item.score as number,
			wins: item.wins as number,
			losses: item.losses as number,
		}));
	}

	async countAboveOnBoard(score: number): Promise<number> {
		// A COUNT query still reads what it counts, a page (1 MB) at a time, so
		// it follows LastEvaluatedKey. O(players above you) - the known cost,
		// and the scale answer is in §6.4.
		let count = 0;
		let start: Record<string, unknown> | undefined;
		do {
			const page = await this.client.send(
				new QueryCommand({
					TableName: this.tableName,
					IndexName: BOARD_INDEX,
					KeyConditionExpression: '#board = :board AND #score > :score',
					ExpressionAttributeNames: { '#board': 'board', '#score': 'score' },
					ExpressionAttributeValues: { ':board': BOARD, ':score': score },
					Select: 'COUNT',
					ExclusiveStartKey: start,
				}),
			);
			count += page.Count ?? 0;
			start = page.LastEvaluatedKey;
		} while (start);
		return count;
	}

	async getBoardTotal(): Promise<number> {
		const { Item } = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { playerId: BOARD_TOTAL_KEY },
			}),
		);
		return (Item?.total as number | undefined) ?? 0;
	}

	async getCachedPodium(): Promise<CachedPodium | null> {
		const { Item } = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { playerId: PODIUM_KEY },
			}),
		);
		return Item
			? {
					entries: Item.entries as BoardEntry[],
					updatedAt: Item.updatedAt as number,
				}
			: null;
	}

	async putCachedPodium({ entries, updatedAt }: CachedPodium) {
		// Last write wins: every writer read the index within the same few
		// seconds, and the cache only has to be no older than ten.
		await this.client.send(
			new PutCommand({
				TableName: this.tableName,
				Item: { playerId: PODIUM_KEY, entries, updatedAt },
			}),
		);
	}
}
