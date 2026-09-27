/**
 * The DynamoDB store against a mocked SDK (engineering spec §9). What is
 * checked here is what the in-memory store in the game tests stands in for:
 * that each write carries the condition that makes it safe, and that a
 * failed condition is reported rather than thrown.
 */

import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { newPlayerRecord } from './game';
import {
	DynamoStore,
	PENDING_BUCKET,
	PENDING_INDEX,
	PRICE_KEY,
} from './dynamo-store';

const TABLE = 'Players';
const ddb = mockClient(DynamoDBDocumentClient);
const store = new DynamoStore(
	DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-central-1' })),
	TABLE,
);

const conditionFailed = (Item?: Record<string, unknown>) =>
	new ConditionalCheckFailedException({
		message: 'The conditional request failed',
		$metadata: {},
		Item: Item as never,
	});

/**
 * DynamoDB rejects a request whose placeholders do not line up exactly with
 * the names and values supplied. Checked here, since the mock would not.
 */
function expectPlaceholdersToMatch(input: {
	UpdateExpression?: string;
	ConditionExpression?: string;
	KeyConditionExpression?: string;
	ExpressionAttributeNames?: Record<string, string>;
	ExpressionAttributeValues?: Record<string, unknown>;
}) {
	const text = [
		input.UpdateExpression,
		input.ConditionExpression,
		input.KeyConditionExpression,
	].join(' ');
	const used = (prefix: string) =>
		[
			...new Set(text.match(new RegExp(`${prefix}[A-Za-z]+`, 'g')) ?? []),
		].sort();
	expect(Object.keys(input.ExpressionAttributeNames ?? {}).sort()).toEqual(
		used('#'),
	);
	expect(Object.keys(input.ExpressionAttributeValues ?? {}).sort()).toEqual(
		used(':'),
	);
}

const T = 1_700_000_000_000;
const guess = {
	id: 'g1',
	direction: 'up' as const,
	priceAtGuess: 100_000,
	createdAt: T,
};
const board = {
	score: 1,
	wins: 1,
	losses: 0,
	currentStreak: 1,
	previousStreak: 0,
	bestStreak: 1,
	history: [],
};

beforeEach(() => ddb.reset());

describe('DynamoStore', () => {
	it('reads a record written before previousStreak existed as 0', async () => {
		const { previousStreak: _, ...old } = newPlayerRecord(
			'anon:a',
			'BriskOtter',
			T,
		);
		ddb.on(GetCommand).resolves({ Item: { ...old, currentStreak: -1 } });
		await expect(store.getPlayer('anon:a')).resolves.toMatchObject({
			currentStreak: -1,
			previousStreak: 0,
		});
	});

	it('reads a player with a strongly consistent read', async () => {
		ddb
			.on(GetCommand)
			.resolves({ Item: { ...newPlayerRecord('anon:a', 'BriskOtter', T) } });
		const player = await store.getPlayer('anon:a');
		expect(player).toMatchObject({
			playerId: 'anon:a',
			publicName: 'BriskOtter',
			score: 0,
			pendingGuess: null,
		});
		expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({
			TableName: TABLE,
			Key: { playerId: 'anon:a' },
			ConsistentRead: true,
		});
	});

	it('creates a player only if the id is unused, with a ttl and no pending guess attribute', async () => {
		ddb.on(PutCommand).resolves({});
		await expect(
			store.createPlayer(newPlayerRecord('anon:a', 'BriskOtter', T)),
		).resolves.toBe(true);
		const input = ddb.commandCalls(PutCommand)[0].args[0].input;
		expect(input.ConditionExpression).toBe('attribute_not_exists(#playerId)');
		expect(input.Item).not.toHaveProperty('pendingGuess');
		expect(input.Item).not.toHaveProperty('board');
		expect(input.Item!.ttl).toBeGreaterThan(T / 1000);

		ddb.on(PutCommand).rejects(conditionFailed());
		await expect(
			store.createPlayer(newPlayerRecord('anon:a', 'BriskOtter', T)),
		).resolves.toBe(false);
	});

	describe('startGuess', () => {
		it('is conditioned on no guess pending, and writes the sweep index keys', async () => {
			ddb.on(UpdateCommand).resolves({});
			await expect(store.startGuess('anon:a', guess, T)).resolves.toBe(
				'started',
			);

			const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
			expect(input.ConditionExpression).toBe(
				'attribute_exists(#playerId) AND attribute_not_exists(#pendingGuess)',
			);
			expect(input.ExpressionAttributeValues).toMatchObject({
				':guess': guess,
				':pendingAt': T,
				':bucket': PENDING_BUCKET,
			});
			expectPlaceholdersToMatch(input);
		});

		it('reports a pending guess when the condition fails on an existing player', async () => {
			ddb
				.on(UpdateCommand)
				.rejects(conditionFailed({ playerId: { S: 'anon:a' } }));
			await expect(store.startGuess('anon:a', guess, T)).resolves.toBe(
				'guess-pending',
			);
		});

		it('reports a missing player when the condition fails with no item', async () => {
			ddb.on(UpdateCommand).rejects(conditionFailed());
			await expect(store.startGuess('anon:a', guess, T)).resolves.toBe(
				'no-player',
			);
		});

		it('rethrows anything that is not a condition failure', async () => {
			ddb.on(UpdateCommand).rejects(new Error('throttled'));
			await expect(store.startGuess('anon:a', guess, T)).rejects.toThrow(
				'throttled',
			);
		});
	});

	describe('settleGuess', () => {
		it('is conditioned on the pending guess id, and moves everything in one write', async () => {
			ddb.on(UpdateCommand).resolves({});
			await expect(store.settleGuess('anon:a', 'g1', board, T)).resolves.toBe(
				true,
			);

			const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
			expect(input.ConditionExpression).toBe('#pendingGuess.#id = :guessId');
			expect(input.ExpressionAttributeValues![':guessId']).toBe('g1');
			expect(input.UpdateExpression).toMatch(
				/REMOVE #pendingGuess, #pendingAt, #pendingBucket$/,
			);
			for (const field of [
				'score',
				'wins',
				'losses',
				'currentStreak',
				'previousStreak',
				'bestStreak',
				'history',
			]) {
				expect(input.UpdateExpression).toContain(`#${field} = :${field}`);
			}
			expectPlaceholdersToMatch(input);
		});

		it('returns false, changing nothing, for the loser of a race', async () => {
			ddb.on(UpdateCommand).rejects(conditionFailed());
			await expect(store.settleGuess('anon:a', 'g1', board, T)).resolves.toBe(
				false,
			);
		});
	});

	it('finds due guesses by querying the sparse index, never scanning', async () => {
		ddb.on(QueryCommand).resolves({
			Items: [
				{
					...newPlayerRecord('anon:a', 'BriskOtter', T),
					pendingGuess: guess,
				},
			],
		});
		const due = await store.listDueGuesses(T + 1, 100);
		expect(due[0].pendingGuess).toEqual(guess);

		const input = ddb.commandCalls(QueryCommand)[0].args[0].input;
		expect(input).toMatchObject({ IndexName: PENDING_INDEX, Limit: 100 });
		expect(input.ExpressionAttributeValues).toEqual({
			':bucket': PENDING_BUCKET,
			':cutoff': T + 1,
		});
		expectPlaceholdersToMatch(input);
	});

	describe('price cache', () => {
		it('reads the one cache item', async () => {
			ddb
				.on(GetCommand)
				.resolves({ Item: { playerId: PRICE_KEY, price: 100, updatedAt: T } });
			await expect(store.getCachedPrice()).resolves.toEqual({
				price: 100,
				updatedAt: T,
			});
		});

		it('never moves the cache backwards, and ignores losing that race', async () => {
			ddb.on(PutCommand).rejects(conditionFailed());
			await expect(
				store.putCachedPrice({ price: 100, updatedAt: T }),
			).resolves.toBeUndefined();

			const input = ddb.commandCalls(PutCommand)[0].args[0].input;
			expect(input.ConditionExpression).toBe(
				'attribute_not_exists(#updatedAt) OR #updatedAt < :updatedAt',
			);
			expect(input.Item).toEqual({
				playerId: PRICE_KEY,
				price: 100,
				updatedAt: T,
			});
		});
	});
});
