#!/usr/bin/env node
/**
 * `npm run dev:local`: the whole app on this machine, no AWS account needed.
 *
 * 1. Downloads DynamoDB Local into .dynamodb/ the first time (needs Java).
 * 2. Starts it, keeping its data in .dynamodb/data so local players survive
 *    a restart. Delete that folder to start from nothing.
 * 3. Creates the Players table if it is missing, shaped like the CDK stack's.
 * 4. Runs `next dev` pointed at it, and stops DynamoDB Local on exit.
 *
 * `--prod` runs `next start` on an existing build instead (the a11y tests
 * use it), and `DEV_LOCAL_TABLE` names a different table, so tests never
 * touch the players you play with.
 *
 * The sweep is not scheduled locally: a guess you watch resolves on its own
 * (the game stream reads state every second), and the route can be called by hand with the local
 * secret printed below.
 */

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
	DIR,
	ensureTable,
	localClient,
	portOpen,
	startDynamoLocal,
} from './dynamodb-local.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(DIR, 'data');
const PORT = Number(process.env.DYNAMODB_LOCAL_PORT ?? 8765);
const TABLE = process.env.DEV_LOCAL_TABLE ?? 'Players';

const env = {
	...process.env,
	PLAYERS_TABLE_NAME: TABLE,
	DYNAMODB_ENDPOINT: `http://localhost:${PORT}`,
	// DynamoDB Local accepts any credentials; these keep the SDK from looking
	// for real ones, so nothing here can reach an AWS account by accident.
	AWS_ACCESS_KEY_ID: 'local',
	AWS_SECRET_ACCESS_KEY: 'local',
	CRON_SECRET: process.env.CRON_SECRET ?? 'local-secret',
};

const log = (msg) => console.log(`\x1b[35m[dev:local]\x1b[0m ${msg}`);
const fail = (msg) => {
	console.error(`\x1b[31m[dev:local]\x1b[0m ${msg}`);
	process.exit(1);
};

async function main() {
	const children = [];
	const stopAll = () => {
		for (const child of children) {
			if (child.exitCode === null) {
				child.kill('SIGTERM');
			}
		}
	};
	process.on('SIGINT', stopAll);
	process.on('SIGTERM', stopAll);

	if (await portOpen(PORT)) {
		log(
			`Port ${PORT} is already in use; assuming DynamoDB Local is running there.`,
		);
	} else {
		log(`Starting DynamoDB Local on port ${PORT} (data in .dynamodb/data)...`);
		const dynamo = await startDynamoLocal({
			port: PORT,
			dbPath: DATA,
			log,
		});
		children.push(dynamo.child);
	}

	await ensureTable(localClient(env.DYNAMODB_ENDPOINT), TABLE, log);
	const prod = process.argv.includes('--prod');
	const args = process.argv.slice(2).filter((a) => a !== '--prod');
	const portFlag = args.findIndex((a) => a === '-p' || a === '--port');
	const appPort =
		portFlag >= 0 ? args[portFlag + 1] : (process.env.PORT ?? '3000');
	log(
		`Table ready. Sweep by hand: curl -X POST -H 'x-cron-secret: ${env.CRON_SECRET}' localhost:${appPort}/api/cron/resolve`,
	);

	// The theme is generated, not committed: build it before Next reads it.
	// A production build already made it.
	if (!prod) {
		const theme = spawnSync('npm', ['run', 'theme'], {
			stdio: 'inherit',
		});
		if (theme.status !== 0) {
			console.error(
				'[dev:local] npm run theme failed (it needs Node >= 22.13)',
			);
			process.exit(theme.status ?? 1);
		}
	}

	// The game stream, served by this same app (engineering spec §3.1): in
	// production it is a Lambda, here the local route that runs the same code.
	env.LOCAL_STREAM = '1';
	env.STREAM_SECRET = process.env.STREAM_SECRET ?? 'local-stream-secret';
	env.STREAM_URL = `http://localhost:${appPort}/api/stream`;

	const next = spawn('npx', ['next', prod ? 'start' : 'dev', ...args], {
		cwd: ROOT,
		env,
		stdio: 'inherit',
	});
	children.push(next);
	next.once('exit', (code) => {
		stopAll();
		process.exit(code ?? 0);
	});
}

main().catch((error) => fail(error.stack ?? String(error)));
