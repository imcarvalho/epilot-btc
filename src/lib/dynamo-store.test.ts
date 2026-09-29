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
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	TransactWriteCommand,
	UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { newPlayerRecord } from './game';
import {
	BOARD,
	BOARD_INDEX,
	BOARD_TOTAL_KEY,
	DynamoStore,
	PENDING_BUCKET,
	PENDING_INDEX,
	PRICE_KEY,
	STREAM_PREFIX,
	TICKET_PREFIX,
} from './dynamo-store';

const TABLE = 'Players';
const ddb = mockClient(DynamoDBDocumentClient);
const store = new DynamoStore(
	DynamoDBDocumentClient.from(
		new DynamoDBClient({
			region: 'eu-central-1',
		}),
	),
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
		ddb.on(GetCommand).resolves({
			Item: {
				...old,
				currentStreak: -1,
			},
		});
		await expect(store.getPlayer('anon:a')).resolves.toMatchObject({
			currentStreak: -1,
			previousStreak: 0,
		});
	});

	it('reads a player with a strongly consistent read', async () => {
		ddb.on(GetCommand).resolves({
			Item: {
				...newPlayerRecord('anon:a', 'BriskOtter', T),
			},
		});
		const player = await store.getPlayer('anon:a');
		expect(player).toMatchObject({
			playerId: 'anon:a',
			publicName: 'BriskOtter',
			score: 0,
			pendingGuess: null,
		});
		expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({
			TableName: TABLE,
			Key: {
				playerId: 'anon:a',
			},
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
			ddb.on(UpdateCommand).rejects(
				conditionFailed({
					playerId: {
						S: 'anon:a',
					},
				}),
			);
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

	describe('ttl', () => {
		it('never gives a signed-in player an expiry, since the board counts them', async () => {
			ddb.on(UpdateCommand).resolves({});
			await store.startGuess('google:b', guess, T);
			await store.settleGuess('google:b', 'g1', board, T);
			for (const call of ddb.commandCalls(UpdateCommand)) {
				const input = call.args[0].input;
				expect(input.UpdateExpression).not.toContain('#ttl');
				expectPlaceholdersToMatch(input);
			}
		});

		it('refreshes an anonymous player on every write', async () => {
			ddb.on(UpdateCommand).resolves({});
			await store.startGuess('anon:a', guess, T);
			await store.settleGuess('anon:a', 'g1', board, T);
			for (const call of ddb.commandCalls(UpdateCommand)) {
				expect(call.args[0].input.ExpressionAttributeValues![':ttl']).toBe(
					Math.floor(T / 1000) + 30 * 24 * 60 * 60,
				);
			}
		});
	});

	describe('createSignedInPlayer', () => {
		const anon = {
			...newPlayerRecord('anon:a', 'BriskOtter', T),
			score: 2,
			pendingGuess: guess,
		};
		const account = {
			...anon,
			playerId: 'google:b',
			onBoard: true,
			updatedAt: T + 5,
		};

		it('moves the record, deletes the old one and counts the board, in one transaction', async () => {
			ddb.on(TransactWriteCommand).resolves({});
			await expect(store.createSignedInPlayer(account, anon)).resolves.toBe(
				true,
			);

			const [put, del, count] =
				ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
			expect(put.Put).toMatchObject({
				ConditionExpression: 'attribute_not_exists(#playerId)',
				Item: {
					playerId: 'google:b',
					score: 2,
					board: BOARD,
					pendingGuess: guess,
					pendingAt: T,
					pendingBucket: PENDING_BUCKET,
				},
			});
			expect(put.Put!.Item).not.toHaveProperty('ttl');
			expect(put.Put!.Item).not.toHaveProperty('onBoard');

			expect(del.Delete).toMatchObject({
				Key: {
					playerId: 'anon:a',
				},
				ConditionExpression:
					'#updatedAt = :updatedAt AND #pendingGuess.#id = :guessId',
				ExpressionAttributeValues: {
					':updatedAt': T,
					':guessId': 'g1',
				},
			});
			expectPlaceholdersToMatch(del.Delete!);

			expect(count.Update).toMatchObject({
				Key: {
					playerId: BOARD_TOTAL_KEY,
				},
				UpdateExpression: 'ADD #total :one',
			});
		});

		it('conditions the delete on no guess pending when none was', async () => {
			ddb.on(TransactWriteCommand).resolves({});
			const idle = {
				...anon,
				pendingGuess: null,
			};
			await store.createSignedInPlayer(
				{
					...account,
					pendingGuess: null,
				},
				idle,
			);
			const del =
				ddb.commandCalls(TransactWriteCommand)[0].args[0].input
					.TransactItems![1].Delete!;
			expect(del.ConditionExpression).toBe(
				'#updatedAt = :updatedAt AND attribute_not_exists(#pendingGuess)',
			);
			expectPlaceholdersToMatch(del);
		});

		it('creates a fresh account with no delete at all', async () => {
			ddb.on(TransactWriteCommand).resolves({});
			await store.createSignedInPlayer(
				{
					...newPlayerRecord('google:b', 'SolemnOtter', T),
					onBoard: true,
				},
				null,
			);
			const items =
				ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
			expect(items.map((i) => Object.keys(i)[0])).toEqual(['Put', 'Update']);
		});

		it('leaves the board total out when the account was counted before', async () => {
			ddb.on(TransactWriteCommand).resolves({});
			await store.createSignedInPlayer(
				{
					...newPlayerRecord('google:b', 'SolemnOtter', T),
					onBoard: true,
				},
				null,
				true,
			);
			const items =
				ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
			expect(items.map((i) => Object.keys(i)[0])).toEqual(['Put']);
		});

		it('returns false when a condition cancels the transaction, and rethrows anything else', async () => {
			ddb.on(TransactWriteCommand).rejects(
				Object.assign(new Error('cancelled'), {
					name: 'TransactionCanceledException',
					CancellationReasons: [
						{
							Code: 'None',
						},
						{
							Code: 'ConditionalCheckFailed',
						},
					],
				}),
			);
			await expect(store.createSignedInPlayer(account, anon)).resolves.toBe(
				false,
			);

			// Another transaction is touching one of the items: nothing was
			// written, and the caller reads and tries again.
			ddb.on(TransactWriteCommand).rejects(
				Object.assign(new Error('cancelled'), {
					name: 'TransactionCanceledException',
					CancellationReasons: [
						{
							Code: 'None',
						},
						{
							Code: 'TransactionConflict',
						},
					],
				}),
			);
			await expect(store.createSignedInPlayer(account, anon)).resolves.toBe(
				false,
			);
			ddb.on(TransactWriteCommand).rejects(
				Object.assign(new Error('in flight'), {
					name: 'TransactionConflictException',
				}),
			);
			await expect(store.createSignedInPlayer(account, anon)).resolves.toBe(
				false,
			);

			ddb.on(TransactWriteCommand).rejects(new Error('throttled'));
			await expect(store.createSignedInPlayer(account, anon)).rejects.toThrow(
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
		expect(input).toMatchObject({
			IndexName: PENDING_INDEX,
			Limit: 100,
		});
		expect(input.ExpressionAttributeValues).toEqual({
			':bucket': PENDING_BUCKET,
			':cutoff': T + 1,
		});
		expectPlaceholdersToMatch(input);
	});

	describe('price cache', () => {
		it('reads the one cache item', async () => {
			ddb.on(GetCommand).resolves({
				Item: {
					playerId: PRICE_KEY,
					price: 100,
					updatedAt: T,
				},
			});
			await expect(store.getCachedPrice()).resolves.toEqual({
				price: 100,
				updatedAt: T,
			});
		});

		it('never moves the cache backwards, and ignores losing that race', async () => {
			ddb.on(PutCommand).rejects(conditionFailed());
			await expect(
				store.putCachedPrice({
					price: 100,
					updatedAt: T,
				}),
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

	describe('leaderboard', () => {
		it('writes the board attribute only for a player on the board', async () => {
			ddb.on(PutCommand).resolves({});
			await store.createPlayer(newPlayerRecord('anon:a', 'BriskOtter', T));
			await store.createPlayer({
				...newPlayerRecord('google:b', 'SolemnOtter', T),
				onBoard: true,
			});
			const [anon, signedIn] = ddb
				.commandCalls(PutCommand)
				.map((c) => c.args[0].input.Item);
			expect(anon).not.toHaveProperty('board');
			expect(anon).not.toHaveProperty('onBoard');
			expect(signedIn).toMatchObject({
				board: BOARD,
			});
			expect(signedIn).not.toHaveProperty('onBoard');
		});

		it('reads the board attribute back as onBoard', async () => {
			ddb.on(GetCommand).resolves({
				Item: {
					...newPlayerRecord('google:b', 'SolemnOtter', T),
					board: BOARD,
				},
			});
			await expect(store.getPlayer('google:b')).resolves.toMatchObject({
				onBoard: true,
			});
		});

		it('takes the podium from the index, best first, never scanning', async () => {
			ddb.on(QueryCommand).resolves({
				Items: [
					{
						playerId: 'google:b',
						publicName: 'SolemnOtter',
						score: 42,
						wins: 50,
						losses: 8,
						board: BOARD,
					},
				],
			});
			await expect(store.listTopOfBoard(3)).resolves.toEqual([
				{
					playerId: 'google:b',
					publicName: 'SolemnOtter',
					score: 42,
					wins: 50,
					losses: 8,
				},
			]);
			const input = ddb.commandCalls(QueryCommand)[0].args[0].input;
			expect(input).toMatchObject({
				IndexName: BOARD_INDEX,
				ScanIndexForward: false,
				Limit: 3,
			});
			expectPlaceholdersToMatch(input);
		});

		it('counts the players above a score across every page of the index', async () => {
			ddb
				.on(QueryCommand)
				.resolvesOnce({
					Count: 1000,
					LastEvaluatedKey: {
						playerId: 'x',
					},
				})
				.resolvesOnce({
					Count: 37,
				});
			await expect(store.countAboveOnBoard(-2)).resolves.toBe(1037);
			const calls = ddb.commandCalls(QueryCommand);
			expect(calls).toHaveLength(2);
			expect(calls[0].args[0].input).toMatchObject({
				Select: 'COUNT',
				IndexName: BOARD_INDEX,
			});
			expect(calls[1].args[0].input.ExclusiveStartKey).toEqual({
				playerId: 'x',
			});
			expect(calls[0].args[0].input.ExpressionAttributeValues).toEqual({
				':board': BOARD,
				':score': -2,
			});
			expectPlaceholdersToMatch(calls[0].args[0].input);
		});

		it('reads the total from the counter item, zero if nobody has joined', async () => {
			ddb
				.on(GetCommand, {
					Key: {
						playerId: BOARD_TOTAL_KEY,
					},
				})
				.resolves({
					Item: {
						playerId: BOARD_TOTAL_KEY,
						total: 1204,
					},
				});
			await expect(store.getBoardTotal()).resolves.toBe(1204);
			ddb.reset();
			ddb.on(GetCommand).resolves({});
			await expect(store.getBoardTotal()).resolves.toBe(0);
		});
	});

	describe('stream tickets and leases (§3.1)', () => {
		it('spends a ticket id with a put that fails if it was spent before', async () => {
			ddb.on(PutCommand).resolves({});
			await expect(store.spendTicket('j1', T + 60_000)).resolves.toBe(true);

			const input = ddb.commandCalls(PutCommand)[0].args[0].input;
			expect(input.Item?.playerId).toBe(`${TICKET_PREFIX}j1`);
			expect(input.ConditionExpression).toBe('attribute_not_exists(playerId)');
			expect(input.Item?.ttl).toBeGreaterThan((T + 60_000) / 1000);
		});

		it('reports a replayed ticket, and rethrows anything else', async () => {
			ddb.on(PutCommand).rejects(conditionFailed());
			await expect(store.spendTicket('j1', T)).resolves.toBe(false);
			ddb.reset();
			ddb.on(PutCommand).rejects(new Error('throttled'));
			await expect(store.spendTicket('j1', T)).rejects.toThrow('throttled');
		});

		it('claims the first slot that is free or lapsed, one conditional put each', async () => {
			ddb
				.on(PutCommand)
				.rejectsOnce(conditionFailed())
				.rejectsOnce(conditionFailed())
				.resolves({});
			await expect(
				store.claimStreamSlot('anon:a', 's1', T, 30_000, 3),
			).resolves.toBe(2);

			const calls = ddb.commandCalls(PutCommand);
			expect(calls.map((c) => c.args[0].input.Item?.playerId)).toEqual([
				`${STREAM_PREFIX}anon:a#0`,
				`${STREAM_PREFIX}anon:a#1`,
				`${STREAM_PREFIX}anon:a#2`,
			]);
			const input = calls[2].args[0].input;
			expect(input.Item).toMatchObject({
				streamId: 's1',
				leaseUntil: T + 30_000,
			});
			expect(input.ConditionExpression).toBe(
				'attribute_not_exists(playerId) OR #leaseUntil < :now',
			);
			expect(input.ExpressionAttributeValues).toEqual({
				':now': T,
			});
			expectPlaceholdersToMatch(input);
		});

		it('gives up with null when every slot is held', async () => {
			ddb.on(PutCommand).rejects(conditionFailed());
			await expect(
				store.claimStreamSlot('anon:a', 's1', T, 30_000, 3),
			).resolves.toBeNull();
			expect(ddb.commandCalls(PutCommand)).toHaveLength(3);
		});

		it('does not swallow a real failure while claiming', async () => {
			ddb.on(PutCommand).rejects(new Error('throttled'));
			await expect(
				store.claimStreamSlot('anon:a', 's1', T, 30_000, 3),
			).rejects.toThrow('throttled');
		});

		it('renews a lease only while the slot is still this stream', async () => {
			ddb.on(UpdateCommand).resolves({});
			await expect(
				store.renewStreamSlot(
					'anon:a',
					{
						slot: 1,
						streamId: 's1',
					},
					T,
					30_000,
				),
			).resolves.toBe(true);
			const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
			expect(input.Key).toEqual({
				playerId: `${STREAM_PREFIX}anon:a#1`,
			});
			expect(input.ConditionExpression).toBe('#streamId = :streamId');
			expect(input.ExpressionAttributeValues).toMatchObject({
				':streamId': 's1',
				':until': T + 30_000,
			});
			expectPlaceholdersToMatch(input);

			ddb.reset();
			ddb.on(UpdateCommand).rejects(conditionFailed());
			await expect(
				store.renewStreamSlot(
					'anon:a',
					{
						slot: 1,
						streamId: 's1',
					},
					T,
					30_000,
				),
			).resolves.toBe(false);
		});

		it('releases a slot only if it is still this stream, and ignores a lost one', async () => {
			ddb.on(DeleteCommand).resolves({});
			await store.releaseStreamSlot('anon:a', {
				slot: 0,
				streamId: 's1',
			});
			const input = ddb.commandCalls(DeleteCommand)[0].args[0].input;
			expect(input.ConditionExpression).toBe('#streamId = :streamId');
			expect(input.ExpressionAttributeValues).toEqual({
				':streamId': 's1',
			});

			ddb.reset();
			ddb.on(DeleteCommand).rejects(conditionFailed());
			await expect(
				store.releaseStreamSlot('anon:a', {
					slot: 0,
					streamId: 's1',
				}),
			).resolves.toBeUndefined();
		});
	});
});
