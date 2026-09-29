/**
 * The DynamoDB store against a real DynamoDB engine (DynamoDB Local).
 *
 * dynamo-store.test.ts mocks the SDK, so it can only say what the store
 * sends; a mock accepts any expression. This says what the engine does with
 * it: that the sign-in transaction and the sweep's index query are valid, and
 * that each behaves as the game relies on. Every test gets its own table,
 * shaped like the CDK stack's (infra/test/local-table.test.mts holds the two
 * together).
 */

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	GetCommand,
	ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { inject } from 'vitest';
import { ensureTable, localClient } from '../../scripts/dynamodb-local.mjs';
import { BOARD_TOTAL_KEY, DynamoStore } from './dynamo-store';
import { newPlayerRecord } from './game';
import type { PendingGuess } from './contracts';
import type { PlayerRecord } from './store';

let raw: DynamoDBClient;
let doc: DynamoDBDocumentClient;
let table: string;
let store: DynamoStore;

beforeEach(async () => {
	raw = localClient(inject('dynamoEndpoint'));
	doc = DynamoDBDocumentClient.from(raw);
	table = `Players-${randomUUID()}`;
	await ensureTable(raw, table);
	store = new DynamoStore(doc, table);
});

afterAll(() => {
	raw?.destroy();
});

const guess = (id: string, createdAt: number): PendingGuess => ({
	id,
	direction: 'up',
	priceAtGuess: 100_000,
	createdAt,
});

const anonymous = (id: string, now = 1_000): PlayerRecord =>
	newPlayerRecord(`anon:${id}`, 'PatientHeron', now);

const signedIn = (sub: string, over: Partial<PlayerRecord> = {}) => ({
	...newPlayerRecord(`google:${sub}`, 'PatientHeron', 2_000),
	onBoard: true,
	...over,
});

const rawItem = async (playerId: string) =>
	(
		await doc.send(
			new GetCommand({
				TableName: table,
				Key: {
					playerId,
				},
				ConsistentRead: true,
			}),
		)
	).Item;

describe('the sign-in transaction', () => {
	it('writes the account on the board, removes the anonymous record and counts the player once', async () => {
		const anon = anonymous('1');
		await store.createPlayer(anon);

		await expect(store.createSignedInPlayer(signedIn('a'), anon)).resolves.toBe(
			true,
		);

		expect(await rawItem('anon:1')).toBeUndefined();
		expect(await rawItem('google:a')).toMatchObject({
			board: 'GLOBAL',
		});
		await expect(store.getBoardTotal()).resolves.toBe(1);
		// Signed-in players carry no expiry: the counter would count someone gone.
		expect((await rawItem('google:a'))!.ttl).toBeUndefined();
	});

	it('adds to the total for each different account that joins', async () => {
		await store.createSignedInPlayer(signedIn('a'), null);
		await store.createSignedInPlayer(signedIn('b'), null);
		await store.createSignedInPlayer(signedIn('c'), null);

		await expect(store.getBoardTotal()).resolves.toBe(3);
	});

	it('is refused, writing and counting nothing, when the account already exists', async () => {
		await store.createSignedInPlayer(signedIn('a'), null);

		await expect(
			store.createSignedInPlayer(
				signedIn('a', {
					score: 99,
				}),
				null,
			),
		).resolves.toBe(false);

		expect((await rawItem('google:a'))!.score).toBe(0);
		await expect(store.getBoardTotal()).resolves.toBe(1);
	});

	it('is refused, and the anonymous record stays, when a guess settled since it was read', async () => {
		const anon = anonymous('1');
		await store.createPlayer(anon);
		await store.startGuess('anon:1', guess('g1', 1_500), 1_500);
		const readBeforeSettle = (await store.getPlayer('anon:1'))!;
		await store.settleGuess(
			'anon:1',
			'g1',
			{
				...readBeforeSettle,
				score: 1,
				wins: 1,
			},
			1_600,
		);

		// The merge read the record while its guess was pending: stale now.
		await expect(
			store.createSignedInPlayer(signedIn('a'), readBeforeSettle),
		).resolves.toBe(false);

		expect(await rawItem('anon:1')).toMatchObject({
			score: 1,
		});
		expect(await rawItem('google:a')).toBeUndefined();
		await expect(store.getBoardTotal()).resolves.toBe(0);
	});

	it('goes through, carrying the pending guess, when the record is as it was read', async () => {
		await store.createPlayer(anonymous('1'));
		await store.startGuess('anon:1', guess('g1', 1_500), 1_500);
		const read = (await store.getPlayer('anon:1'))!;

		await expect(
			store.createSignedInPlayer(
				{
					...read,
					playerId: 'google:a',
					onBoard: true,
				},
				read,
			),
		).resolves.toBe(true);

		expect(await rawItem('anon:1')).toBeUndefined();
		expect((await store.getPlayer('google:a'))!.pendingGuess).toMatchObject({
			id: 'g1',
		});
	});

	it('leaves the total at exactly one when two sign-ins race for the same account', async () => {
		const anon = anonymous('1');
		await store.createPlayer(anon);

		const results = await Promise.allSettled([
			store.createSignedInPlayer(signedIn('a'), anon),
			store.createSignedInPlayer(signedIn('a'), anon),
		]);

		// Whichever way the loser is told (refused, or a transaction conflict
		// the caller retries), the account was written once and counted once.
		expect(
			results.filter((r) => r.status === 'fulfilled' && r.value).length,
		).toBe(1);
		await expect(store.getBoardTotal()).resolves.toBe(1);
		expect(await rawItem('anon:1')).toBeUndefined();
		const items = (
			await doc.send(
				new ScanCommand({
					TableName: table,
				}),
			)
		).Items!;
		expect(items.map((i) => i.playerId).sort()).toEqual([
			BOARD_TOTAL_KEY,
			'google:a',
		]);
	});
});

describe('the sweep index (byPending)', () => {
	async function started(id: string, createdAt: number) {
		await store.createPlayer(anonymous(id));
		await store.startGuess(
			`anon:${id}`,
			guess(`g-${id}`, createdAt),
			createdAt,
		);
	}

	it('lists only the guesses due by the cutoff, oldest first', async () => {
		await started('late', 5_000);
		await started('early', 1_000);
		await started('middle', 3_000);
		await store.createPlayer(anonymous('idle'));

		const due = await store.listDueGuesses(3_000, 10);

		expect(due.map((p) => p.playerId)).toEqual(['anon:early', 'anon:middle']);
		expect(due[0].pendingGuess).toMatchObject({
			id: 'g-early',
		});
	});

	it('respects the limit', async () => {
		for (const [id, at] of [
			['a', 1_000],
			['b', 2_000],
			['c', 3_000],
		] as const) {
			await started(id, at);
		}

		const due = await store.listDueGuesses(10_000, 2);

		expect(due.map((p) => p.playerId)).toEqual(['anon:a', 'anon:b']);
	});

	it('drops a guess from the index when it settles, and takes it back for the next', async () => {
		await started('a', 1_000);
		const player = (await store.getPlayer('anon:a'))!;
		await store.settleGuess(
			'anon:a',
			'g-a',
			{
				...player,
				score: 1,
				wins: 1,
			},
			2_000,
		);

		await expect(store.listDueGuesses(10_000, 10)).resolves.toEqual([]);

		await store.startGuess('anon:a', guess('g-a2', 3_000), 3_000);
		const again = await store.listDueGuesses(10_000, 10);
		expect(again.map((p) => p.pendingGuess?.id)).toEqual(['g-a2']);
	});

	it('does not put signed-in players with no guess in the index', async () => {
		await store.createSignedInPlayer(signedIn('a'), null);
		await expect(store.listDueGuesses(10_000, 10)).resolves.toEqual([]);
	});
});

describe('the leaderboard index (byScore)', () => {
	it('orders by score, negative scores included, and leaves anonymous players off', async () => {
		await store.createSignedInPlayer(
			signedIn('low', {
				score: -2,
			}),
			null,
		);
		await store.createSignedInPlayer(
			signedIn('top', {
				score: 7,
			}),
			null,
		);
		await store.createSignedInPlayer(
			signedIn('mid', {
				score: 3,
			}),
			null,
		);
		await store.createPlayer({
			...anonymous('anon'),
			score: 50,
		});

		const top = await store.listTopOfBoard(10);

		expect(top.map((e) => [e.playerId, e.score])).toEqual([
			['google:top', 7],
			['google:mid', 3],
			['google:low', -2],
		]);
		expect(top[0]).toEqual({
			playerId: 'google:top',
			publicName: 'PatientHeron',
			score: 7,
			wins: 0,
			losses: 0,
		});
	});

	it('counts those strictly above a score, equal scores sharing a rank', async () => {
		for (const [sub, score] of [
			['a', 5],
			['b', 3],
			['c', 3],
			['d', 1],
		] as const) {
			await store.createSignedInPlayer(
				signedIn(sub, {
					score,
				}),
				null,
			);
		}

		await expect(store.countAboveOnBoard(3)).resolves.toBe(1);
		await expect(store.countAboveOnBoard(1)).resolves.toBe(3);
		await expect(store.countAboveOnBoard(-10)).resolves.toBe(4);
		await expect(store.countAboveOnBoard(5)).resolves.toBe(0);
	});
});

describe('the once-only writes', () => {
	it('starts a guess once, and reports a missing player without a second read', async () => {
		await store.createPlayer(anonymous('1'));

		await expect(
			store.startGuess('anon:1', guess('g1', 1_500), 1_500),
		).resolves.toBe('started');
		await expect(
			store.startGuess('anon:1', guess('g2', 1_600), 1_600),
		).resolves.toBe('guess-pending');
		await expect(
			store.startGuess('anon:nobody', guess('g3', 1_700), 1_700),
		).resolves.toBe('no-player');
	});

	it('settles a guess once: the second settle of the same guess changes nothing', async () => {
		await store.createPlayer(anonymous('1'));
		await store.startGuess('anon:1', guess('g1', 1_500), 1_500);
		const player = (await store.getPlayer('anon:1'))!;

		const [a, b] = await Promise.all([
			store.settleGuess(
				'anon:1',
				'g1',
				{
					...player,
					score: 1,
					wins: 1,
				},
				2_000,
			),
			store.settleGuess(
				'anon:1',
				'g1',
				{
					...player,
					score: 1,
					wins: 1,
				},
				2_001,
			),
		]);

		expect([a, b].filter(Boolean)).toHaveLength(1);
		expect((await store.getPlayer('anon:1'))!.score).toBe(1);
	});
});
