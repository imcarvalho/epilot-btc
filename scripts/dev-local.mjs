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
 * The sweep is not scheduled locally: a guess you watch resolves on its own
 * (GET /api/state), and the route can be called by hand with the local
 * secret printed below.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import {
	CreateTableCommand,
	DescribeTableCommand,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, '.dynamodb');
const JAR = join(DIR, 'DynamoDBLocal.jar');
const DATA = join(DIR, 'data');
const DOWNLOAD =
	'https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz';
const PORT = Number(process.env.DYNAMODB_LOCAL_PORT ?? 8765);
const TABLE = 'Players';

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

function requireJava() {
	const java = spawnSync('java', ['-version'], { stdio: 'ignore' });
	if (java.error || java.status !== 0) {
		fail(
			'DynamoDB Local needs Java 17 or newer on your PATH (https://adoptium.net).',
		);
	}
}

async function ensureJar() {
	if (existsSync(JAR)) {
		return;
	}
	log('Downloading DynamoDB Local (first run only)...');
	mkdirSync(DIR, { recursive: true });
	const res = await fetch(DOWNLOAD);
	if (!res.ok) {
		fail(`Download failed: ${res.status} ${res.statusText}`);
	}
	const archive = join(DIR, 'dynamodb_local.tar.gz');
	writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
	const tar = spawnSync('tar', ['-xzf', archive, '-C', DIR], {
		stdio: 'inherit',
	});
	rmSync(archive);
	if (tar.status !== 0 || !existsSync(JAR)) {
		fail('Could not unpack DynamoDB Local.');
	}
}

function portOpen(port) {
	return new Promise((resolve) => {
		const socket = connect(port, '127.0.0.1');
		socket.once('connect', () => (socket.end(), resolve(true)));
		socket.once('error', () => resolve(false));
	});
}

async function waitForPort(port, ms = 15_000) {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await portOpen(port)) {
			return;
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	fail(`DynamoDB Local did not start on port ${port}.`);
}

/** Same key and indexes as infra/lib/btc-guess-stack.ts. */
async function ensureTable() {
	const client = new DynamoDBClient({
		endpoint: env.DYNAMODB_ENDPOINT,
		region: 'eu-central-1',
		credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
	});
	try {
		await client.send(new DescribeTableCommand({ TableName: TABLE }));
		return;
	} catch (error) {
		if (error.name !== 'ResourceNotFoundException') {
			throw error;
		}
	}
	log(`Creating table ${TABLE}...`);
	await client.send(
		new CreateTableCommand({
			TableName: TABLE,
			BillingMode: 'PAY_PER_REQUEST',
			KeySchema: [{ AttributeName: 'playerId', KeyType: 'HASH' }],
			AttributeDefinitions: [
				{ AttributeName: 'playerId', AttributeType: 'S' },
				{ AttributeName: 'board', AttributeType: 'S' },
				{ AttributeName: 'score', AttributeType: 'N' },
				{ AttributeName: 'pendingBucket', AttributeType: 'S' },
				{ AttributeName: 'pendingAt', AttributeType: 'N' },
			],
			GlobalSecondaryIndexes: [
				{
					IndexName: 'byScore',
					KeySchema: [
						{ AttributeName: 'board', KeyType: 'HASH' },
						{ AttributeName: 'score', KeyType: 'RANGE' },
					],
					Projection: {
						ProjectionType: 'INCLUDE',
						NonKeyAttributes: ['publicName', 'wins', 'losses'],
					},
				},
				{
					IndexName: 'byPending',
					KeySchema: [
						{ AttributeName: 'pendingBucket', KeyType: 'HASH' },
						{ AttributeName: 'pendingAt', KeyType: 'RANGE' },
					],
					Projection: { ProjectionType: 'ALL' },
				},
			],
		}),
	);
}

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
		requireJava();
		await ensureJar();
		mkdirSync(DATA, { recursive: true });
		log(`Starting DynamoDB Local on port ${PORT} (data in .dynamodb/data)...`);
		const dynamo = spawn(
			'java',
			[
				`-Djava.library.path=${join(DIR, 'DynamoDBLocal_lib')}`,
				'-jar',
				JAR,
				'-sharedDb',
				'-dbPath',
				DATA,
				'-port',
				String(PORT),
				// On by default; nothing about local development needs to leave the machine.
				'-disableTelemetry',
			],
			// It writes a metadata file into its working directory: keep that out of the repo.
			{ cwd: DIR, stdio: 'ignore' },
		);
		children.push(dynamo);
		dynamo.once('exit', (code) => {
			if (code) {
				console.error(`[dev:local] DynamoDB Local exited with code ${code}`);
			}
		});
		await waitForPort(PORT);
	}

	await ensureTable();
	const args = process.argv.slice(2);
	const portFlag = args.findIndex((a) => a === '-p' || a === '--port');
	const appPort =
		portFlag >= 0 ? args[portFlag + 1] : (process.env.PORT ?? '3000');
	log(
		`Table ready. Sweep by hand: curl -X POST -H 'x-cron-secret: ${env.CRON_SECRET}' localhost:${appPort}/api/cron/resolve`,
	);

	const next = spawn('npx', ['next', 'dev', ...args], {
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
