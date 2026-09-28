/**
 * The game stream's host in production: a Lambda Function URL in
 * RESPONSE_STREAM mode (engineering spec §3.1), because Amplify Hosting
 * buffers a whole response and cuts it at 30 s, so it cannot serve
 * Server-Sent Events.
 *
 * The secret the stream tokens are signed with lives in SSM Parameter Store
 * and is read at cold start, so it never appears in the template or the
 * function's configuration.
 *
 * Everything the stream says comes from `runGameStream`, which the local
 * Next route runs too; this file is only the Lambda's way of writing it.
 */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { getDeps } from '@/lib/deps';
import { verifyStreamToken } from '@/lib/stream-token';
import { formatEvent, runGameStream } from './game-stream';

interface StreamifyResponse {
	write(chunk: string): boolean;
	end(): void;
	on(event: 'close' | 'error', listener: () => void): void;
}

interface FunctionUrlEvent {
	queryStringParameters?: Record<string, string | undefined>;
}

declare const awslambda: {
	streamifyResponse(
		handler: (
			event: FunctionUrlEvent,
			stream: StreamifyResponse,
		) => Promise<void>,
	): unknown;
	HttpResponseStream: {
		from(
			stream: StreamifyResponse,
			metadata: {
				statusCode: number;
				headers: Record<string, string>;
			},
		): StreamifyResponse;
	};
};

/** A little under the function's 15-minute limit, so the stream ends cleanly. */
const STREAM_LIFETIME_MS = 14 * 60_000;

const ssm = new SSMClient({});
let secret: string | undefined;

async function streamSecret(): Promise<string> {
	if (secret) {
		return secret;
	}
	const { Parameter } = await ssm.send(
		new GetParameterCommand({
			Name: process.env.STREAM_SECRET_PARAMETER,
			WithDecryption: true,
		}),
	);
	if (!Parameter?.Value) {
		throw new Error('stream secret parameter is empty');
	}
	secret = Parameter.Value;
	return secret;
}

export const handler = awslambda.streamifyResponse(async (event, raw) => {
	const token = event.queryStringParameters?.token ?? '';
	const playerId = verifyStreamToken(token, await streamSecret(), Date.now());
	if (!playerId) {
		const refused = awslambda.HttpResponseStream.from(raw, {
			statusCode: 401,
			headers: {
				'content-type': 'text/plain',
			},
		});
		refused.write('unauthorized');
		refused.end();
		return;
	}

	const stream = awslambda.HttpResponseStream.from(raw, {
		statusCode: 200,
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
		},
	});

	let open = true;
	raw.on('close', () => {
		open = false;
	});

	// Reconnect a second after the stream ends or drops.
	stream.write('retry: 1000\n\n');
	await runGameStream(
		getDeps(),
		playerId,
		{
			send: (event) => {
				stream.write(formatEvent(event));
			},
			isOpen: () => open,
		},
		{
			lifetimeMs: STREAM_LIFETIME_MS,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		},
	);
	stream.end();
});
