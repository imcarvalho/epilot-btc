import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb'
import { Effect, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

/**
 * The data tier from docs/engineering-spec.md §2 and §8: one table, two
 * sparse GSIs, and the IAM policy that is the one connection point between
 * this stack and Amplify Hosting's SSR compute role.
 *
 * This is deliberately just the day-one hello-world (CLAUDE.md, "Day one,
 * before any feature code", item 2): the table and the access policy, so
 * the Amplify role reaching DynamoDB can be proven before any route
 * handler is written. The scheduler (§3.2, EventBridge -> /api/cron/resolve)
 * is not here yet — it has nothing to call until that route exists.
 */
export class BtcGuessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // One item per player, keyed by playerId ("anon:<uuid>" or
    // "google:<sub>"). Removal policy is DESTROY: this is a take-home
    // exercise, not a production game, and a clean `cdk destroy` matters
    // more here than retaining demo player data.
    const table = new Table(this, 'PlayersTable', {
      partitionKey: { name: 'playerId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    })

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
    })

    // Sweep (§3.2). Sparse on `pendingBucket`: written by the same
    // conditional write that creates a guess, removed by the one that
    // resolves it, so an item sits in this index for as long as it has a
    // guess outstanding — typically seconds. ALL projection because the
    // sweep needs the pending guess itself to resolve it, and the index
    // only ever holds the current working set, not the whole table.
    table.addGlobalSecondaryIndex({
      indexName: 'byPending',
      partitionKey: { name: 'pendingBucket', type: AttributeType.STRING },
      sortKey: { name: 'pendingAt', type: AttributeType.NUMBER },
      projectionType: ProjectionType.ALL,
    })

    // §8: "the app runs under an execution role with least-privilege
    // access to the one table and its indexes." Amplify Hosting creates
    // its own SSR compute role when a repository is connected — this
    // policy is the connection point named in §2.1, attached to that role
    // once it exists rather than created here, since CDK has no handle on
    // a role Amplify hasn't provisioned yet.
    const tableAccessPolicy = new ManagedPolicy(this, 'PlayersTableAccessPolicy', {
      description:
        'Least-privilege read/write access to the Players table and its indexes, for the Amplify SSR compute role',
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
          resources: [table.tableArn, `${table.tableArn}/index/*`],
        }),
      ],
    })

    new CfnOutput(this, 'PlayersTableName', { value: table.tableName })
    new CfnOutput(this, 'PlayersTableArn', { value: table.tableArn })
    new CfnOutput(this, 'PlayersTableAccessPolicyArn', { value: tableAccessPolicy.managedPolicyArn })
  }
}
