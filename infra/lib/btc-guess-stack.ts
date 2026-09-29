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
import {
	Alarm,
	ComparisonOperator,
	Metric,
	TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Effect, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
	Code,
	Function,
	FunctionUrlAuthType,
	HttpMethod,
	InvokeMode,
	Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
	FilterPattern,
	LogGroup,
	MetricFilter,
	RetentionDays,
} from 'aws-cdk-lib/aws-logs';
import {
	Schedule,
	ScheduleExpression,
	ScheduleGroup,
} from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * The shared secret the sweep route checks. A SecureString, which
 * CloudFormation cannot create, so it is put in place once by hand (see the
 * README) and only referenced here - its value never enters a template.
 */
export const CRON_SECRET_PARAMETER = '/btc-guess/cron-secret';

/** The key stream tokens are signed with, shared with the web tier. Put in place by hand, like the cron secret. */
export const STREAM_SECRET_PARAMETER = '/btc-guess/stream-secret';

/** The repository root: the stream function is bundled from the app's own source. */
const APP_ROOT = path.join(__dirname, '..', '..');

/**
 * What the app may do with the table. Item actions apply to the table only;
 * an index can only be read, so it gets `Query` and nothing that would look
 * like a write.
 */
function tableAccessStatements(table: Table): PolicyStatement[] {
	return [
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
			resources: [table.tableArn],
		}),
		new PolicyStatement({
			effect: Effect.ALLOW,
			actions: ['dynamodb:Query'],
			resources: [`${table.tableArn}/index/*`],
		}),
	];
}

export interface BtcGuessStackProps extends StackProps {
	/** Full URL of the deployed `POST /api/cron/resolve` route. */
	sweepUrl: string;
	/** Origins allowed to open the game stream: the site, and local development. */
	streamOrigins: string[];
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
			partitionKey: {
				name: 'playerId',
				type: AttributeType.STRING,
			},
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
			partitionKey: {
				name: 'board',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'score',
				type: AttributeType.NUMBER,
			},
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
			partitionKey: {
				name: 'pendingBucket',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'pendingAt',
				type: AttributeType.NUMBER,
			},
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
				statements: tableAccessStatements(table),
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

		// §8 observability. A stalled sweep (due guesses, no readable price)
		// makes the trigger throw, so it counts in the function's Errors, and
		// so does any other failed sweep. Price-fetch failures are logged by
		// the stream function and counted from its log group. Alarms have no
		// action yet: who gets told, and how, is not decided.
		new Alarm(this, 'SweepFailingAlarm', {
			alarmDescription:
				'The sweep failed or is stalled on an unreadable price: guesses left by closed browsers are not resolving',
			metric: sweepTrigger.metricErrors({
				period: Duration.minutes(5),
				statistic: 'Sum',
			}),
			threshold: 1,
			evaluationPeriods: 2,
			datapointsToAlarm: 2,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING,
		});

		// The account's Lambda concurrency limit is 10 and AWS requires 100
		// unreserved, so nothing can be reserved for the sweep (§8, §11). It
		// shares the pool with the streams, and the only protection is what
		// follows: streams end after two minutes, the schedule retries a
		// throttled run, and both a throttle and a dropped run raise an alarm.
		new Alarm(this, 'SweepThrottledAlarm', {
			alarmDescription:
				"The sweep trigger was throttled: streams are holding all ten of the account's Lambda executions. Request a concurrency quota increase (engineering spec §11)",
			metric: sweepTrigger.metricThrottles({
				period: Duration.minutes(1),
				statistic: 'Sum',
			}),
			threshold: 1,
			evaluationPeriods: 1,
			datapointsToAlarm: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING,
		});
		const defaultScheduleGroup = ScheduleGroup.fromDefaultScheduleGroup(
			this,
			'DefaultScheduleGroup',
		);
		new Alarm(this, 'SweepDroppedAlarm', {
			alarmDescription:
				'EventBridge Scheduler gave up on a sweep after its retries: guesses left by closed browsers are not resolving',
			metric: defaultScheduleGroup.metricDropped({
				period: Duration.minutes(1),
				statistic: 'Sum',
			}),
			threshold: 1,
			evaluationPeriods: 1,
			datapointsToAlarm: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING,
		});

		new Schedule(this, 'SweepSchedule', {
			description:
				'Resolves guesses left pending by closed browsers (engineering spec §3.2)',
			schedule: ScheduleExpression.rate(Duration.minutes(1)),
			// A throttled run (all ten executions busy with streams) is retried
			// with back-off for up to five minutes rather than dropped. Runs may
			// then overlap, which is safe: the sweep is idempotent, every
			// resolution being a conditional write (§3.2).
			target: new LambdaInvoke(sweepTrigger, {
				retryAttempts: 5,
				maxEventAge: Duration.minutes(5),
			}),
		});

		// §3.1: the game stream. Amplify Hosting buffers a response and cuts
		// it at 30 s, so Server-Sent Events are served from a Lambda Function
		// URL in RESPONSE_STREAM mode instead, which streams for up to 15
		// minutes. Bundled from the app's own source, so the stream and the
		// routes share one implementation of the game.
		const streamSecret = StringParameter.fromSecureStringParameterAttributes(
			this,
			'StreamSecret',
			{
				parameterName: STREAM_SECRET_PARAMETER,
			},
		);

		const gameStream = new NodejsFunction(this, 'GameStream', {
			description:
				'Streams the game to one browser as Server-Sent Events (engineering spec §3.1)',
			runtime: Runtime.NODEJS_24_X,
			entry: path.join(APP_ROOT, 'src', 'stream', 'lambda.ts'),
			handler: 'handler',
			projectRoot: APP_ROOT,
			depsLockFilePath: path.join(APP_ROOT, 'package-lock.json'),
			bundling: {
				tsconfig: path.join(APP_ROOT, 'tsconfig.json'),
				// The Node runtime ships the AWS SDK v3.
				externalModules: ['@aws-sdk/*'],
			},
			memorySize: 256,
			// A stream ends itself after two minutes and the browser reconnects
			// (`STREAM_LIFETIME_MS`); the timeout is a backstop so a stuck one
			// cannot hold one of the account's ten executions for long.
			timeout: Duration.minutes(3),
			environment: {
				STREAM_SECRET_PARAMETER,
				PLAYERS_TABLE_NAME: table.tableName,
			},
			logGroup: new LogGroup(this, 'GameStreamLogs', {
				retention: RetentionDays.ONE_WEEK,
				removalPolicy: RemovalPolicy.DESTROY,
			}),
		});
		streamSecret.grantRead(gameStream);
		tableAccessStatements(table).forEach((statement) => {
			gameStream.addToRolePolicy(statement);
		});

		const feedFailures = new Metric({
			namespace: 'BtcGuess',
			metricName: 'PriceFeedFailures',
			statistic: 'Sum',
			period: Duration.minutes(5),
		});
		new MetricFilter(this, 'PriceFeedFailuresFilter', {
			logGroup: gameStream.logGroup,
			metricNamespace: 'BtcGuess',
			metricName: 'PriceFeedFailures',
			filterPattern: FilterPattern.any(
				FilterPattern.stringValue('$.event', '=', 'price-fetch-failed'),
				FilterPattern.stringValue('$.event', '=', 'tape-fetch-failed'),
			),
			metricValue: '1',
		});
		new Alarm(this, 'PriceFeedFailingAlarm', {
			alarmDescription:
				'Coinbase reads keep failing in the game stream: the screen shows the delayed-feed state and nothing resolves',
			metric: feedFailures,
			threshold: 5,
			evaluationPeriods: 2,
			datapointsToAlarm: 2,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING,
		});

		// Public, like the site: the stream checks its own signed token.
		const streamUrl = gameStream.addFunctionUrl({
			authType: FunctionUrlAuthType.NONE,
			invokeMode: InvokeMode.RESPONSE_STREAM,
			cors: {
				allowedOrigins: props.streamOrigins,
				allowedMethods: [HttpMethod.GET],
				maxAge: Duration.hours(1),
			},
		});

		new CfnOutput(this, 'StreamUrl', {
			value: streamUrl.url,
		});
		new CfnOutput(this, 'PlayersTableName', {
			value: table.tableName,
		});
		new CfnOutput(this, 'PlayersTableArn', {
			value: table.tableArn,
		});
		new CfnOutput(this, 'PlayersTableAccessPolicyArn', {
			value: tableAccessPolicy.managedPolicyArn,
		});
	}
}
