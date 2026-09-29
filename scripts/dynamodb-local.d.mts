import type { ChildProcess } from 'node:child_process';
import type {
	CreateTableCommandInput,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

export const DIR: string;
export function tableInput(tableName: string): CreateTableCommandInput;
export function portOpen(port: number): Promise<boolean>;
export function requireJava(): void;
export function ensureJar(log?: (message: string) => void): Promise<void>;
export function waitForPort(port: number, ms?: number): Promise<void>;
export function startDynamoLocal(options: {
	port: number;
	/** Where to keep its data; omit to run in memory. */
	dbPath?: string;
	log?: (message: string) => void;
}): Promise<{
	child: ChildProcess;
	stop(): void;
}>;
export function localClient(endpoint: string): DynamoDBClient;
export function ensureTable(
	client: DynamoDBClient,
	tableName: string,
	log?: (message: string) => void,
): Promise<void>;
