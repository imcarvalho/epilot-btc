import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { BtcGuessStack } from '../lib/btc-guess-stack'

function synth(): Template {
  const app = new App()
  const stack = new BtcGuessStack(app, 'TestStack', { env: { region: 'eu-central-1' } })
  return Template.fromStack(stack)
}

describe('BtcGuessStack', () => {
  it('creates exactly one table, on-demand, keyed by playerId, with TTL', () => {
    const template = synth()

    template.resourceCountIs('AWS::DynamoDB::Table', 1)
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'playerId', KeyType: 'HASH' }],
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    })
  })

  it('has no sort key on the base table — one item per player', () => {
    const template = synth()

    const [table] = Object.values(template.findResources('AWS::DynamoDB::Table'))
    const baseKeySchema = table.Properties.KeySchema as Array<{ KeyType: string }>
    expect(baseKeySchema).toHaveLength(1)
  })

  it('indexes the leaderboard sparsely on board/score, projecting only what a row needs', () => {
    const template = synth()

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'byScore',
          KeySchema: [
            { AttributeName: 'board', KeyType: 'HASH' },
            { AttributeName: 'score', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: Match.arrayWith(['publicName', 'wins', 'losses']),
          },
        }),
      ]),
    })
  })

  it('indexes the sweep sparsely on pendingBucket/pendingAt', () => {
    const template = synth()

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'byPending',
          KeySchema: [
            { AttributeName: 'pendingBucket', KeyType: 'HASH' },
            { AttributeName: 'pendingAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    })
  })

  it('defines exactly two indexes — no accidental extra access pattern', () => {
    const template = synth()

    const [table] = Object.values(template.findResources('AWS::DynamoDB::Table'))
    const indexes = table.Properties.GlobalSecondaryIndexes as unknown[]
    expect(indexes).toHaveLength(2)
  })

  it('grants the SSR compute role read/write on the table and its indexes, nothing else', () => {
    const template = synth()

    template.resourceCountIs('AWS::IAM::ManagedPolicy', 1)
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith([
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:Query',
            ]),
          }),
        ],
      },
    })
  })

  it('scopes the policy to this table and its indexes, not a wildcard resource', () => {
    const template = synth()

    const [policy] = Object.values(template.findResources('AWS::IAM::ManagedPolicy'))
    const statement = policy.Properties.PolicyDocument.Statement[0]
    const resources = statement.Resource as unknown[]

    expect(resources).toHaveLength(2)
    expect(resources).not.toContain('*')
  })

  it('destroys the table on stack teardown — this is a take-home exercise, not production', () => {
    const template = synth()

    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    })
  })
})
