import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { sweep } from '@/lib/game';
import { error, json } from '../../respond';

const CRON_SECRET_HEADER = 'x-cron-secret';

/** Constant-time, and hashed first so unequal lengths do not short-circuit. */
function secretMatches(
	given: string | null,
	expected: string | undefined,
): boolean {
	if (!given || !expected) {
		return false;
	}
	const digest = (s: string) => createHash('sha256').update(s).digest();
	return timingSafeEqual(digest(given), digest(expected));
}

/**
 * The scheduled sweep (engineering spec §3.2): resolves guesses left behind
 * by closed browsers. Called by the scheduler, never by a browser, and
 * rejects anything without the shared secret. With no secret configured it
 * rejects everything rather than running open.
 */
export async function POST(request: NextRequest) {
	if (
		!secretMatches(
			request.headers.get(CRON_SECRET_HEADER),
			process.env.CRON_SECRET,
		)
	) {
		return error('unauthorized', 401);
	}
	return json(await sweep(getDeps()));
}
