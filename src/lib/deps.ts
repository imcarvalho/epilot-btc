/**
 * The real dependencies, built once per runtime instance: the DynamoDB store,
 * the Coinbase ticker and trade tape, the server clock. Route handlers take
 * them from here; tests replace this module.
 *
 * `PLAYERS_TABLE_NAME` is the CDK stack's `PlayersTableName` output. The
 * table's region is set explicitly rather than taken from the runtime's
 * `AWS_REGION`: the table lives in eu-central-1 (§2) whatever region the
 * web tier happens to run in.
 *
 * `E2E_PRICE_FEED_DOWN` is for the accessibility tests only: it makes every
 * Coinbase fetch fail - the price, the trades and the chart's candles - so
 * they can show the screen during an outage. Never set it anywhere a player
 * reaches.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoStore } from './dynamo-store';
import type { GameDeps } from './game';
import { fetchTickerPrice } from './price';
import { fetchHourCandles } from './hour-candles';
import { fetchTape } from './settlement';
import { createSharedTape } from './shared-tape';

/**
 * The SDK waits on a hung connection indefinitely by default (and only warns
 * at `requestTimeout` unless told to throw), and the stream reads the store
 * every second: a call that has not answered in two seconds is abandoned and
 * retried once, so a stalled call costs about four seconds of ticks (logged
 * as `stream-tick-failed`) rather than the stream. DynamoDB answers
 * in milliseconds; a retried conditional write that had in fact landed fails
 * its condition, and is read back like any lost race.
 */
export const DYNAMO_TIMEOUTS = {
	requestHandler: {
		connectionTimeout: 1_000,
		requestTimeout: 2_000,
		throwOnRequestTimeout: true,
	},
	maxAttempts: 2,
};

let deps: GameDeps | undefined;

export function getDeps(): GameDeps {
	if (deps) {
		return deps;
	}

	const tableName = process.env.PLAYERS_TABLE_NAME;
	if (!tableName) {
		throw new Error('PLAYERS_TABLE_NAME is not set');
	}

	const client = DynamoDBDocumentClient.from(
		new DynamoDBClient({
			region: process.env.PLAYERS_TABLE_REGION || 'eu-central-1',
			// Local development against DynamoDB Local only; unset in every deployed environment.
			endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
			...DYNAMO_TIMEOUTS,
		}),
	);

	// One tape read per process, shared by every stream and the sweep.
	const sharedTape = createSharedTape({
		fetchTape,
		now: () => Date.now(),
	});

	deps = {
		store: new DynamoStore(client, tableName),
		fetchPrice: process.env.E2E_PRICE_FEED_DOWN
			? async () => {
					throw new Error('price feed down (E2E_PRICE_FEED_DOWN)');
				}
			: () => fetchTickerPrice(),
		fetchTape: process.env.E2E_PRICE_FEED_DOWN
			? async () => {
					throw new Error('price feed down (E2E_PRICE_FEED_DOWN)');
				}
			: (from) => sharedTape(from),
		fetchCandles: process.env.E2E_PRICE_FEED_DOWN
			? async () => {
					throw new Error('price feed down (E2E_PRICE_FEED_DOWN)');
				}
			: (now) => fetchHourCandles(now),
		now: () => Date.now(),
		newId: () => crypto.randomUUID(),
	};
	return deps;
}
