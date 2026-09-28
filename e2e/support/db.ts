/**
 * Direct writes to the e2e table in DynamoDB Local, for states that would
 * otherwise take a real minute to reach: a guess about to settle, a board
 * with players on it. Only ever the `PlayersE2E` table on localhost.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	PutCommand,
	UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Page } from '@playwright/test';

const TABLE = 'PlayersE2E';

const db = DynamoDBDocumentClient.from(
	new DynamoDBClient({
		endpoint: `http://localhost:${process.env.DYNAMODB_LOCAL_PORT ?? 8765}`,
		region: 'eu-central-1',
		credentials: {
			accessKeyId: 'local',
			secretAccessKey: 'local',
		},
	}),
);

/** The browser's anonymous player, from its cookie. */
export async function playerIdOf(page: Page): Promise<string> {
	const cookie = (await page.context().cookies()).find(
		(c) => c.name === 'btc_player',
	);
	if (!cookie) {
		throw new Error('no player cookie yet');
	}
	return `anon:${cookie.value}`;
}

/**
 * Gives the player a guess locked `ageMs` ago at a price of $1, so any real
 * price has moved from it: it settles as soon as the minute is up - a win
 * for `up`, a loss for `down`.
 */
export async function lockGuessAgo(
	playerId: string,
	direction: 'up' | 'down',
	ageMs: number,
): Promise<void> {
	const createdAt = Date.now() - ageMs;
	await db.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: {
				playerId,
			},
			UpdateExpression:
				'SET pendingGuess = :guess, pendingAt = :at, pendingBucket = :bucket, updatedAt = :at',
			ExpressionAttributeValues: {
				':guess': {
					id: `e2e-${createdAt}`,
					direction,
					priceAtGuess: 1,
					createdAt,
				},
				':at': createdAt,
				':bucket': 'PENDING',
			},
		}),
	);
}

/** Four signed-in players on the board, so it renders a full podium. */
export async function seedBoard(): Promise<void> {
	const seeds = [
		['SolemnOtter', 42, 75],
		['AudaciousRaccoon', 38, 70],
		['PatientHeron', 31, 60],
		['BriskMarten', -2, 25],
	] as const;
	await Promise.all(
		seeds.map(([publicName, score, guesses], i) =>
			db.send(
				new PutCommand({
					TableName: TABLE,
					Item: {
						playerId: `google:e2e-seed-${i}`,
						publicName,
						board: 'GLOBAL',
						score,
						wins: (guesses + score) / 2,
						losses: (guesses - score) / 2,
						currentStreak: 0,
						previousStreak: 0,
						bestStreak: 0,
						history: [],
						createdAt: 0,
						updatedAt: 0,
					},
				}),
			),
		),
	);
	await db.send(
		new PutCommand({
			TableName: TABLE,
			Item: {
				playerId: 'BOARD#GLOBAL',
				total: seeds.length,
			},
		}),
	);
	// The podium cache would otherwise hide the seeds for up to ten seconds.
	await db.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: {
				playerId: 'BOARD#PODIUM',
			},
		}),
	);
}

/**
 * Sets the server's cached game price, or removes it. With the price feed
 * down, that cache is all the server has: an old entry is a stale feed, no
 * entry is a game that has never had a price.
 */
export async function setCachedPrice(
	cached: {
		price: number;
		updatedAt: number;
	} | null,
): Promise<void> {
	await db.send(
		cached
			? new PutCommand({
					TableName: TABLE,
					Item: {
						playerId: 'PRICE#BTCUSD',
						...cached,
					},
				})
			: new DeleteCommand({
					TableName: TABLE,
					Key: {
						playerId: 'PRICE#BTCUSD',
					},
				}),
	);
}
