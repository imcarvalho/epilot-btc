/**
 * A second copy of the app with Coinbase cut off on the server side
 * (`E2E_PRICE_FEED_DOWN`), for the outage tests. It serves the same build as
 * the main test server and uses the DynamoDB Local that server started, in
 * the same test table.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export const OUTAGE_PORT = 3101;
export const OUTAGE_URL = `http://localhost:${OUTAGE_PORT}`;

export async function startOutageServer(): Promise<() => void> {
	const server: ChildProcess = spawn(
		'npx',
		['next', 'start', '-p', String(OUTAGE_PORT)],
		{
			env: {
				...process.env,
				PLAYERS_TABLE_NAME: 'PlayersE2E',
				DYNAMODB_ENDPOINT: `http://localhost:${process.env.DYNAMODB_LOCAL_PORT ?? 8765}`,
				AWS_ACCESS_KEY_ID: 'local',
				AWS_SECRET_ACCESS_KEY: 'local',
				CRON_SECRET: 'local-secret',
				E2E_PRICE_FEED_DOWN: '1',
				LOCAL_STREAM: '1',
				STREAM_SECRET: 'local-stream-secret',
				STREAM_URL: `${OUTAGE_URL}/api/stream`,
			},
			stdio: 'ignore',
			// Its own process group, so stopping it stops what npx started too.
			detached: true,
		},
	);
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(OUTAGE_URL)).ok) {
				return () => {
					if (server.pid) {
						process.kill(-server.pid);
					}
				};
			}
		} catch {
			// Not listening yet.
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`the outage server did not start on ${OUTAGE_URL}`);
}
