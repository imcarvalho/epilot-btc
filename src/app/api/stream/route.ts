import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { verifyStreamToken } from '@/lib/stream-token';
import { formatEvent, runGameStream } from '@/stream/game-stream';

export const dynamic = 'force-dynamic';

/** Short, so a local stream reconnects often enough to exercise it. */
const LOCAL_STREAM_LIFETIME_MS = 5 * 60_000;

/**
 * The game stream for local development and the e2e tests (engineering spec
 * §3.1). In production the stream is a Lambda, because Amplify Hosting
 * buffers responses and cuts them at 30 s; this route runs the same
 * `runGameStream` under `next dev` and `next start`, where streaming works.
 *
 * Off unless `LOCAL_STREAM=1`, so the deployed site never serves a stream
 * that would be cut after 30 s.
 */
export async function GET(request: NextRequest) {
	const secret = process.env.STREAM_SECRET;
	if (process.env.LOCAL_STREAM !== '1' || !secret) {
		return new Response('not found', {
			status: 404,
		});
	}

	const deps = getDeps();
	const playerId = verifyStreamToken(
		request.nextUrl.searchParams.get('token') ?? '',
		secret,
		deps.now(),
	);
	if (!playerId) {
		return new Response('unauthorized', {
			status: 401,
		});
	}

	const encoder = new TextEncoder();
	// The browser can leave between two writes: after that, write nothing.
	let open = true;
	request.signal.addEventListener('abort', () => {
		open = false;
	});
	const stream = new ReadableStream<Uint8Array>({
		cancel() {
			open = false;
		},
		async start(controller) {
			controller.enqueue(encoder.encode('retry: 1000\n\n'));
			await runGameStream(
				deps,
				playerId,
				{
					send: (event) => {
						if (open) {
							controller.enqueue(encoder.encode(formatEvent(event)));
						}
					},
					isOpen: () => open,
				},
				{
					lifetimeMs: LOCAL_STREAM_LIFETIME_MS,
					sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
				},
			);
			if (open) {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
		},
	});
}
