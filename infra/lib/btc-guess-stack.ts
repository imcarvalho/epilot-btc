import * as path from 'node:path';
import {
	CfnOutput,
	Duration,
	RemovalPolicy,
	Stack,
	StackProps,
} from 'aws-cdk-lib';
import {
	AttributeType,
	BillingMode,
	ProjectionType,
	Table,
} from 'aws-cdk-lib/aws-dynamodb';
import { Effect, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * The shared secret the sweep route checks. A SecureString, which
 * CloudFormation cannot create, so it is put in place once by hand (see the
 * README) and only referenced here - its value never enters a template.
 */
export const CRON_SECRET_PARAMETER = '/btc-guess/cron-secret';

export interface BtcGuessStackProps extends StackProps {
	/** Full URL of the deployed `POST /api/cron/resolve` route. */
	sweepUrl: string;
}

/**
 * The data tier and the schedule from docs/engineering-spec.md §2, §3.2 and
 * §8: one table, two sparse GSIs, the IAM policy that is the one connection
 * point between this stack and Amplify Hosting's SSR compute role, and the
 * once-a-minute sweep of guesses left behind by closed browsers.
 */
export class BtcGuessStack extends Stack {
	constructor(scope: Construct, id: string, props: BtcGuessStackProps) {
		super(scope, id, props);

		// One item per player, keyed by playerId ("anon:<uuid>" or
		// "google:<sub>"). Removal policy is DESTROY: this is a take-home
		// exercise, not a production game, and a clean `cdk destroy` matters
		// more here than retaining demo player data.
		const table = new Table(this, 'PlayersTable', {
			partitionKey: { name: 'playerId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		});

		// Leaderboard (§6.4). Sparse on `board`: only signed-in, eligible
		// players ever carry that attribute, so anonymous players never enter
		// this index. Projection includes exactly what a podium row needs, so
		// the three top rows cost one query rather than one query plus three
		// reads back to the table.
		table.addGlobalSecondaryIndex({
			indexName: 'byScore',
			partitionKey: { name: 'board', type: AttributeType.STRING },
			sortKey: { name: 'score', type: AttributeType.NUMBER },
			projectionType: ProjectionType.INCLUDE,
			nonKeyAttributes: ['publicName', 'wins', 'losses'],
		});

		// Sweep (§3.2). Sparse on `pendingBucket`: written by the same
		// conditional write that creates a guess, removed by the one that
		// resolves it, so an item sits in this index for as long as it has a
		// guess outstanding - typically seconds. ALL projection because the
		// sweep needs the pending guess itself to resolve it, and the index
		// only ever holds the current working set, not the whole table.
		table.addGlobalSecondaryIndex({
			indexName: 'byPending',
			partitionKey: { name: 'pendingBucket', type: AttributeType.STRING },
			sortKey: { name: 'pendingAt', type: AttributeType.NUMBER },
			projectionType: ProjectionType.ALL,
		});

		// §8: "the app runs under an execution role with least-privilege
		// access to the one table and its indexes." Amplify Hosting creates
		// its own SSR compute role when a repository is connected - this
		// policy is the connection point named in §2.1, attached to that role
		// once it exists rather than created here, since CDK has no handle on
		// a role Amplify hasn't provisioned yet.
		const tableAccessPolicy = new ManagedPolicy(
			this,
			'PlayersTableAccessPolicy',
			{
				description:
					'Least-privilege read/write access to the Players table and its indexes, for the Amplify SSR compute role',
				statements: [
					new PolicyStatement({
						effect: Effect.ALLOW,
						actions: [
							'dynamodb:GetItem',
							'dynamodb:PutItem',
							'dynamodb:UpdateItem',
							// First sign-in deletes the anonymous item it promotes, inside a
							// TransactWriteItems - which IAM authorises per item action.
							'dynamodb:DeleteItem',
							'dynamodb:Query',
						],
						resources: [table.tableArn, `${table.tableArn}/index/*`],
					}),
				],
			},
		);

		// §3.2: the sweep. EventBridge Scheduler cannot call an HTTPS endpoint,
		// so it invokes a function that makes the one POST. Scheduler and
		// Lambda both stay inside the free tier at one call a minute, which an
		// API destination (billed per call) would not.
		const cronSecret = StringParameter.fromSecureStringParameterAttributes(
			this,
			'CronSecret',
			{
				parameterName: CRON_SECRET_PARAMETER,
			},
		);

		const sweepTrigger = new Function(this, 'SweepTrigger', {
			description:
				'Calls POST /api/cron/resolve once; invoked every minute by EventBridge Scheduler',
			runtime: Runtime.NODEJS_24_X,
			handler: 'index.handler',
			code: Code.fromAsset(
				path.join(__dirname, '..', 'lambda', 'sweep-trigger'),
			),
			memorySize: 128,
			// Covers a cold start on the Amplify side; the next run is a minute away anyway.
			timeout: Duration.seconds(15),
			environment: {
				SWEEP_URL: props.sweepUrl,
				CRON_SECRET_PARAMETER,
			},
			logGroup: new LogGroup(this, 'SweepTriggerLogs', {
				retention: RetentionDays.ONE_WEEK,
				removalPolicy: RemovalPolicy.DESTROY,
			}),
		});
		cronSecret.grantRead(sweepTrigger);

		new Schedule(this, 'SweepSchedule', {
			description:
				'Resolves guesses left pending by closed browsers (engineering spec §3.2)',
			schedule: ScheduleExpression.rate(Duration.minutes(1)),
			// No retries: a missed run is covered by the next one a minute later,
			// and the sweep is idempotent either way.
			target: new LambdaInvoke(sweepTrigger, {
				retryAttempts: 0,
				maxEventAge: Duration.minutes(1),
			}),
		});

		new CfnOutput(this, 'PlayersTableName', { value: table.tableName });
		new CfnOutput(this, 'PlayersTableArn', { value: table.tableArn });
		new CfnOutput(this, 'PlayersTableAccessPolicyArn', {
			value: tableAccessPolicy.managedPolicyArn,
		});
	}
}
