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
 */

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
	type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { PendingGuess } from './contracts';
import type { Scoreboard } from './scoring';
import type {
	CachedPrice,
	GameStore,
	PlayerRecord,
	StartGuessResult,
} from './store';

export const PRICE_KEY = 'PRICE#BTCUSD';
export const PENDING_INDEX = 'byPending';
export const PENDING_BUCKET = 'PENDING';

/** §8: inactive players expire after 30 days, refreshed on every write. */
const PLAYER_TTL_SECONDS = 30 * 24 * 60 * 60;
const ttlFrom = (now: number) => Math.floor(now / 1000) + PLAYER_TTL_SECONDS;

// Several of these (`ttl`, `history`) are DynamoDB reserved words, so every
// attribute goes through a name placeholder rather than only the ones that
// happen to clash today.
const NAMES = {
	'#playerId': 'playerId',
	'#score': 'score',
	'#wins': 'wins',
	'#losses': 'losses',
	'#currentStreak': 'currentStreak',
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

function toPlayer(item: Record<string, unknown>): PlayerRecord {
	return {
		playerId: item.playerId as string,
		publicName: item.publicName as string,
		score: item.score as number,
		wins: item.wins as number,
		losses: item.losses as number,
		currentStreak: item.currentStreak as number,
		bestStreak: item.bestStreak as number,
		history: (item.history as PlayerRecord['history']) ?? [],
		pendingGuess: (item.pendingGuess as PendingGuess | undefined) ?? null,
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
		const { pendingGuess, ...rest } = player;
		try {
			await this.client.send(
				new PutCommand({
					TableName: this.tableName,
					Item: {
						...rest,
						...(pendingGuess ? { pendingGuess } : {}),
						ttl: ttlFrom(player.createdAt),
					},
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

	async startGuess(
		playerId: string,
		guess: PendingGuess,
		now: number,
	): Promise<StartGuessResult> {
		try {
			await this.client.send(
				new UpdateCommand({
					TableName: this.tableName,
					Key: { playerId },
					UpdateExpression:
						'SET #pendingGuess = :guess, #pendingAt = :pendingAt, #pendingBucket = :bucket, #updatedAt = :now, #ttl = :ttl',
					ConditionExpression:
						'attribute_exists(#playerId) AND attribute_not_exists(#pendingGuess)',
					ExpressionAttributeNames: pick(
						NAMES,
						'#playerId',
						'#pendingGuess',
						'#pendingAt',
						'#pendingBucket',
						'#updatedAt',
						'#ttl',
					),
					ExpressionAttributeValues: {
						':guess': guess,
						':pendingAt': guess.createdAt,
						':bucket': PENDING_BUCKET,
						':now': now,
						':ttl': ttlFrom(now),
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
		try {
			await this.client.send(
				new UpdateCommand({
					TableName: this.tableName,
					Key: { playerId },
					UpdateExpression:
						'SET #score = :score, #wins = :wins, #losses = :losses, #currentStreak = :currentStreak, ' +
						'#bestStreak = :bestStreak, #history = :history, #updatedAt = :now, #ttl = :ttl ' +
						'REMOVE #pendingGuess, #pendingAt, #pendingBucket',
					ConditionExpression: '#pendingGuess.#id = :guessId',
					ExpressionAttributeNames: SETTLE_NAMES,
					ExpressionAttributeValues: {
						':score': board.score,
						':wins': board.wins,
						':losses': board.losses,
						':currentStreak': board.currentStreak,
						':bestStreak': board.bestStreak,
						':history': board.history,
						':now': now,
						':ttl': ttlFrom(now),
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
}
