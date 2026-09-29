/**
 * The store's integration tests and the a11y tests run against a table made
 * by scripts/dynamodb-local.mjs. That is only evidence about production if
 * the table is the one this stack creates, so the two are compared here.
 */

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { tableInput } from '../../scripts/dynamodb-local.mjs';
import { BtcGuessStack } from '../lib/btc-guess-stack.js';

function stackTable() {
	const app = new App({
		context: {
			'aws:cdk:bundling-stacks': [],
		},
	});
	const stack = new BtcGuessStack(app, 'TestStack', {
		env: {
			region: 'eu-central-1',
		},
		sweepUrl: 'https://example.test/api/cron/resolve',
		streamOrigins: ['https://site.test'],
	});
	const [table] = Object.values(
		Template.fromStack(stack).findResources('AWS::DynamoDB::Table'),
	);
	return table.Properties;
}

const byName = <T extends { AttributeName?: string; IndexName?: string }>(
	items: T[],
) =>
	[...items].sort((a, b) =>
		(a.AttributeName ?? a.IndexName ?? '').localeCompare(
			b.AttributeName ?? b.IndexName ?? '',
		),
	);

describe('the DynamoDB Local table', () => {
	const local = tableInput('Players');

	it('has the stack key, billing mode and attributes', () => {
		const stack = stackTable();

		expect(local.KeySchema).toEqual(stack.KeySchema);
		expect(local.BillingMode).toBe(stack.BillingMode);
		expect(byName(local.AttributeDefinitions!)).toEqual(
			byName(stack.AttributeDefinitions),
		);
	});

	it('has the stack indexes, keys and projections', () => {
		const stack = stackTable();

		expect(byName(local.GlobalSecondaryIndexes!)).toEqual(
			byName(
				stack.GlobalSecondaryIndexes.map((i: Record<string, unknown>) => ({
					IndexName: i.IndexName,
					KeySchema: i.KeySchema,
					Projection: i.Projection,
				})),
			),
		);
	});
});
