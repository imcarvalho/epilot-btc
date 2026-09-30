/**
 * DynamoDB Local, shared by everything that needs a real DynamoDB engine on
 * this machine: `npm run dev:local`, the accessibility tests' server, and the
 * store's integration tests (src/lib/dynamo-store.integration.test.ts). One
 * place downloads it, starts it and shapes the table, so what the tests run
 * against is what you play against.
 *
 * The table definition mirrors infra/lib/btc-guess-stack.ts, and
 * infra/test/local-table.test.ts fails if the two drift apart.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import {
	CreateTableCommand,
	DescribeTableCommand,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

const ROOT = new URL('..', import.meta.url).pathname;
export const DIR = join(ROOT, '.dynamodb');
const JAR = join(DIR, 'DynamoDBLocal.jar');
const DOWNLOAD =
	'https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz';
/**
 * AWS publishes DynamoDB Local only as "latest", with no versioned archive,
 * so the version is pinned by its checksum instead: 3.3.1 (2026-05-28), as
 * AWS's own `dynamodb_local_latest.tar.gz.sha256` gives it. When AWS ships a
 * new release the download stops matching and fails, naming the hash it got,
 * rather than changing the engine the tests run against unannounced. Check
 * the release notes, then update this.
 */
const SHA256 =
	'f80bcec477f85f57e2c77f8d54aa6b672a8403fceff0c450560aee1cf6c21163';

/** The table the CDK stack creates, as a CreateTable input. */
export function tableInput(tableName) {
	return {
		TableName: tableName,
		BillingMode: 'PAY_PER_REQUEST',
		KeySchema: [
			{
				AttributeName: 'playerId',
				KeyType: 'HASH',
			},
		],
		AttributeDefinitions: [
			{
				AttributeName: 'playerId',
				AttributeType: 'S',
			},
			{
				AttributeName: 'board',
				AttributeType: 'S',
			},
			{
				AttributeName: 'score',
				AttributeType: 'N',
			},
			{
				AttributeName: 'pendingBucket',
				AttributeType: 'S',
			},
			{
				AttributeName: 'pendingAt',
				AttributeType: 'N',
			},
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: 'byScore',
				KeySchema: [
					{
						AttributeName: 'board',
						KeyType: 'HASH',
					},
					{
						AttributeName: 'score',
						KeyType: 'RANGE',
					},
				],
				Projection: {
					ProjectionType: 'INCLUDE',
					NonKeyAttributes: ['publicName', 'wins', 'losses'],
				},
			},
			{
				IndexName: 'byPending',
				KeySchema: [
					{
						AttributeName: 'pendingBucket',
						KeyType: 'HASH',
					},
					{
						AttributeName: 'pendingAt',
						KeyType: 'RANGE',
					},
				],
				Projection: {
					ProjectionType: 'ALL',
				},
			},
		],
	};
}

export function portOpen(port) {
	return new Promise((resolve) => {
		const socket = connect(port, '127.0.0.1');
		socket.once('connect', () => (socket.end(), resolve(true)));
		socket.once('error', () => resolve(false));
	});
}

export function requireJava() {
	const java = spawnSync('java', ['-version'], {
		stdio: 'ignore',
	});
	if (java.error || java.status !== 0) {
		throw new Error(
			'DynamoDB Local needs Java 17 or newer on your PATH (https://adoptium.net).',
		);
	}
}

/** Downloads DynamoDB Local into .dynamodb/ the first time, checked against `SHA256`. */
export async function ensureJar(log = () => {}) {
	if (existsSync(JAR)) {
		return;
	}
	log('Downloading DynamoDB Local (first run only)...');
	mkdirSync(DIR, {
		recursive: true,
	});
	const res = await fetch(DOWNLOAD);
	if (!res.ok) {
		throw new Error(`Download failed: ${res.status} ${res.statusText}`);
	}
	const bytes = Buffer.from(await res.arrayBuffer());
	const got = createHash('sha256').update(bytes).digest('hex');
	if (got !== SHA256) {
		throw new Error(
			`DynamoDB Local download has sha256 ${got}, expected ${SHA256}: AWS has probably released a new version. Check its release notes, then update SHA256 in scripts/dynamodb-local.mjs.`,
		);
	}
	const archive = join(DIR, 'dynamodb_local.tar.gz');
	writeFileSync(archive, bytes);
	const tar = spawnSync('tar', ['-xzf', archive, '-C', DIR], {
		stdio: 'inherit',
	});
	rmSync(archive);
	if (tar.status !== 0 || !existsSync(JAR)) {
		throw new Error('Could not unpack DynamoDB Local.');
	}
}

export async function waitForPort(port, ms = 15_000) {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await portOpen(port)) {
			return;
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`DynamoDB Local did not start on port ${port}.`);
}

/**
 * Starts DynamoDB Local on `port`, keeping its data in `dbPath` - or in
 * memory, for a run that should leave nothing behind. Resolves once it is
 * accepting connections; `stop()` ends it.
 */
export async function startDynamoLocal({ port, dbPath, log = () => {} }) {
	requireJava();
	await ensureJar(log);
	if (dbPath) {
		mkdirSync(dbPath, {
			recursive: true,
		});
	}
	const child = spawn(
		'java',
		[
			`-Djava.library.path=${join(DIR, 'DynamoDBLocal_lib')}`,
			'-jar',
			JAR,
			'-sharedDb',
			...(dbPath ? ['-dbPath', dbPath] : ['-inMemory']),
			'-port',
			String(port),
			// On by default; nothing about local development needs to leave the machine.
			'-disableTelemetry',
		],
		// It writes a metadata file into its working directory: keep that out of the repo.
		{
			cwd: DIR,
			stdio: 'ignore',
		},
	);
	let stopping = false;
	child.once('exit', (code) => {
		if (code && !stopping) {
			console.error(`[dynamodb-local] exited with code ${code}`);
		}
	});
	await waitForPort(port);
	return {
		child,
		stop() {
			stopping = true;
			if (child.exitCode === null) {
				child.kill('SIGTERM');
			}
		},
	};
}

/** A client for DynamoDB Local: it accepts any credentials, so nothing here can reach an AWS account. */
export function localClient(endpoint) {
	return new DynamoDBClient({
		endpoint,
		region: 'eu-central-1',
		credentials: {
			accessKeyId: 'local',
			secretAccessKey: 'local',
		},
	});
}

/** Creates the table unless it is already there. */
export async function ensureTable(client, tableName, log = () => {}) {
	try {
		await client.send(
			new DescribeTableCommand({
				TableName: tableName,
			}),
		);
		return;
	} catch (error) {
		if (error.name !== 'ResourceNotFoundException') {
			throw error;
		}
	}
	log(`Creating table ${tableName}...`);
	await client.send(new CreateTableCommand(tableInput(tableName)));
}
