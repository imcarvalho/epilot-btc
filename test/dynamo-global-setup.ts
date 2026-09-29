/**
 * Starts an in-memory DynamoDB Local for the integration tests and hands its
 * address to them. Its own port and no files, so it never touches the one
 * `npm run dev:local` keeps. Java is required, and its absence fails the run
 * rather than skipping the tests: a skipped test proves nothing.
 */

/// <reference path="../src/lib/testing/vitest-context.d.ts" />
import type { TestProject } from 'vitest/node';
import { startDynamoLocal } from '../scripts/dynamodb-local.mjs';

const PORT = Number(process.env.DYNAMODB_TEST_PORT ?? 8766);

export default async function setup(project: TestProject) {
	const dynamo = await startDynamoLocal({
		port: PORT,
	});
	project.provide('dynamoEndpoint', `http://localhost:${PORT}`);
	return () => dynamo.stop();
}
