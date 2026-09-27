/**
 * The real dependencies, built once per runtime instance: the DynamoDB store,
 * the Coinbase fetch, the server clock. Route handlers take them from here;
 * tests replace this module.
 *
 * `PLAYERS_TABLE_NAME` is the CDK stack's `PlayersTableName` output. The
 * table's region is set explicitly rather than taken from the runtime's
 * `AWS_REGION`: the table lives in eu-central-1 (§2) whatever region the
 * web tier happens to run in.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoStore } from "./dynamo-store";
import type { GameDeps } from "./game";
import { fetchTickerPrice } from "./price";

let deps: GameDeps | undefined;

export function getDeps(): GameDeps {
  if (deps) return deps;

  const tableName = process.env.PLAYERS_TABLE_NAME;
  if (!tableName) throw new Error("PLAYERS_TABLE_NAME is not set");

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.PLAYERS_TABLE_REGION || "eu-central-1",
      // Local development against DynamoDB Local only; unset in every deployed environment.
      endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    }),
  );

  deps = {
    store: new DynamoStore(client, tableName),
    fetchPrice: () => fetchTickerPrice(),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  };
  return deps;
}
