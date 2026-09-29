import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
	BtcGuessStack,
	CRON_SECRET_PARAMETER,
	STREAM_SECRET_PARAMETER,
} from '../lib/btc-guess-stack';

const SWEEP_URL = 'https://example.test/api/cron/resolve';

function synth(): Template {
	// No bundling: these tests read the template, not the stream's code.
	const app = new App({
		context: {
			'aws:cdk:bundling-stacks': [],
		},
	});
	const stack = new BtcGuessStack(app, 'TestStack', {
		env: {
			region: 'eu-central-1',
		},
		sweepUrl: SWEEP_URL,
		streamOrigins: ['https://site.test'],
	});
	return Template.fromStack(stack);
}

describe('BtcGuessStack', () => {
	it('creates exactly one table, on-demand, keyed by playerId, with TTL', () => {
		const template = synth();

		template.resourceCountIs('AWS::DynamoDB::Table', 1);
		template.hasResourceProperties('AWS::DynamoDB::Table', {
			BillingMode: 'PAY_PER_REQUEST',
			KeySchema: [
				{
					AttributeName: 'playerId',
					KeyType: 'HASH',
				},
			],
			TimeToLiveSpecification: {
				AttributeName: 'ttl',
				Enabled: true,
			},
		});
	});

	it('has no sort key on the base table - one item per player', () => {
		const template = synth();

		const [table] = Object.values(
			template.findResources('AWS::DynamoDB::Table'),
		);
		const baseKeySchema = table.Properties.KeySchema as Array<{
			KeyType: string;
		}>;
		expect(baseKeySchema).toHaveLength(1);
	});

	it('indexes the leaderboard sparsely on board/score, projecting only what a row needs', () => {
		const template = synth();

		template.hasResourceProperties('AWS::DynamoDB::Table', {
			GlobalSecondaryIndexes: Match.arrayWith([
				Match.objectLike({
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
						NonKeyAttributes: Match.arrayWith(['publicName', 'wins', 'losses']),
					},
				}),
			]),
		});
	});

	it('indexes the sweep sparsely on pendingBucket/pendingAt', () => {
		const template = synth();

		template.hasResourceProperties('AWS::DynamoDB::Table', {
			GlobalSecondaryIndexes: Match.arrayWith([
				Match.objectLike({
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
				}),
			]),
		});
	});

	it('defines exactly two indexes - no accidental extra access pattern', () => {
		const template = synth();

		const [table] = Object.values(
			template.findResources('AWS::DynamoDB::Table'),
		);
		const indexes = table.Properties.GlobalSecondaryIndexes as unknown[];
		expect(indexes).toHaveLength(2);
	});

	it('grants the SSR compute role item access on the table and only Query on its indexes', () => {
		const template = synth();

		template.resourceCountIs('AWS::IAM::ManagedPolicy', 1);
		const [policy] = Object.values(
			template.findResources('AWS::IAM::ManagedPolicy'),
		);
		const statements = policy.Properties.PolicyDocument.Statement as Array<{
			Action: string[] | string;
			Resource: unknown;
		}>;

		expect(statements).toHaveLength(2);
		const [onTable, onIndexes] = statements;
		expect(onTable.Action).toEqual([
			'dynamodb:GetItem',
			'dynamodb:PutItem',
			'dynamodb:UpdateItem',
			'dynamodb:DeleteItem',
			'dynamodb:Query',
		]);
		expect(onIndexes.Action).toEqual('dynamodb:Query');
		expect(JSON.stringify(onTable.Resource)).not.toContain('/index/');
		expect(JSON.stringify(onIndexes.Resource)).toContain('/index/*');
		expect(JSON.stringify(statements)).not.toContain('"*"');
	});

	it('alarms on a failing or stalled sweep', () => {
		const template = synth();

		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			Namespace: 'AWS/Lambda',
			MetricName: 'Errors',
			Threshold: 1,
			EvaluationPeriods: 2,
		});
	});

	it('counts price-feed failures from the stream logs and alarms on them', () => {
		const template = synth();

		template.hasResourceProperties('AWS::Logs::MetricFilter', {
			MetricTransformations: [
				Match.objectLike({
					MetricName: 'PriceFeedFailures',
					MetricNamespace: 'BtcGuess',
				}),
			],
		});
		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			Namespace: 'BtcGuess',
			MetricName: 'PriceFeedFailures',
		});
	});

	it('destroys the table on stack teardown - this is a take-home exercise, not production', () => {
		const template = synth();

		template.hasResource('AWS::DynamoDB::Table', {
			DeletionPolicy: 'Delete',
			UpdateReplacePolicy: 'Delete',
		});
	});

	it('runs the sweep every minute, retrying a throttled run for up to five minutes', () => {
		const template = synth();

		template.resourceCountIs('AWS::Scheduler::Schedule', 1);
		template.hasResourceProperties('AWS::Scheduler::Schedule', {
			ScheduleExpression: 'rate(1 minute)',
			State: 'ENABLED',
			Target: Match.objectLike({
				RetryPolicy: {
					MaximumRetryAttempts: 5,
					MaximumEventAgeInSeconds: 300,
				},
			}),
		});
	});

	it('points the trigger at the sweep route and names the secret parameter, never its value', () => {
		const template = synth();

		template.hasResourceProperties('AWS::Lambda::Function', {
			Handler: 'index.handler',
			Environment: {
				Variables: {
					SWEEP_URL,
					CRON_SECRET_PARAMETER,
				},
			},
		});
		expect(JSON.stringify(template.toJSON())).not.toMatch(/x-cron-secret/i);
	});

	it('lets the trigger read the one secret parameter and nothing else in SSM', () => {
		const template = synth();

		template.hasResourceProperties('AWS::IAM::Policy', {
			PolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Effect: 'Allow',
						Action: Match.arrayWith(['ssm:GetParameter']),
						Resource: Match.objectLike({
							'Fn::Join': Match.arrayWith([
								Match.arrayWith([`:parameter${CRON_SECRET_PARAMETER}`]),
							]),
						}),
					}),
				]),
			},
		});
	});

	it('serves the game stream from a streaming Function URL, open only to the site', () => {
		const template = synth();

		template.hasResourceProperties('AWS::Lambda::Url', {
			AuthType: 'NONE',
			InvokeMode: 'RESPONSE_STREAM',
			Cors: {
				AllowOrigins: ['https://site.test'],
				AllowMethods: ['GET'],
			},
		});
		template.hasOutput('StreamUrl', {});
	});

	it('caps a stream function at three minutes and names its secret, never its value', () => {
		const template = synth();

		template.hasResourceProperties('AWS::Lambda::Function', {
			Timeout: 180,
			Environment: {
				Variables: Match.objectLike({
					STREAM_SECRET_PARAMETER,
				}),
			},
		});
	});

	it('alarms on the sweep trigger being throttled, on the first throttle', () => {
		const template = synth();

		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			Namespace: 'AWS/Lambda',
			MetricName: 'Throttles',
			Statistic: 'Sum',
			Period: 60,
			Threshold: 1,
			EvaluationPeriods: 1,
			ComparisonOperator: 'GreaterThanOrEqualToThreshold',
			Dimensions: [
				{
					Name: 'FunctionName',
					Value: Match.objectLike({
						Ref: Match.stringLikeRegexp('^SweepTrigger'),
					}),
				},
			],
		});
	});

	it('alarms on the scheduler dropping a sweep, in the default schedule group', () => {
		const template = synth();

		template.hasResourceProperties('AWS::CloudWatch::Alarm', {
			Namespace: 'AWS/Scheduler',
			MetricName: 'InvocationDroppedCount',
			Statistic: 'Sum',
			Threshold: 1,
			EvaluationPeriods: 1,
			Dimensions: [
				{
					Name: 'ScheduleGroup',
					Value: 'default',
				},
			],
		});
	});

	it('does not reserve concurrency: the account limit of 10 leaves nothing to reserve', () => {
		const template = synth();

		for (const fn of Object.values(
			template.findResources('AWS::Lambda::Function'),
		)) {
			expect(fn.Properties).not.toHaveProperty('ReservedConcurrentExecutions');
		}
	});

	it('gives the stream function no table action beyond the app policy: no scans, batches or table admin', () => {
		const template = synth();

		const actions = Object.values(template.findResources('AWS::IAM::Policy'))
			.flatMap(
				(policy) =>
					policy.Properties.PolicyDocument.Statement as Array<{
						Action: string[] | string;
					}>,
			)
			.flatMap((statement) => [statement.Action].flat())
			.filter((action) => action.startsWith('dynamodb:'));
		expect(actions.length).toBeGreaterThan(0);
		expect(new Set(actions)).toEqual(
			new Set([
				'dynamodb:GetItem',
				'dynamodb:PutItem',
				'dynamodb:UpdateItem',
				'dynamodb:DeleteItem',
				'dynamodb:Query',
			]),
		);
	});
});
