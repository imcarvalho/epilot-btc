import { NextResponse, type NextRequest } from 'next/server';
import type { ApiError, ApiErrorCode } from '@/lib/contracts';
import { sessionPlayerId } from '@/auth';
import { PLAYER_COOKIE, playerIdFromCookie } from '@/lib/identity';

/** Game state is per player and changes by the second: nothing is cacheable. */
export function json<T>(body: T, status = 200): NextResponse<T> {
	return NextResponse.json(body, {
		status,
		headers: {
			'cache-control': 'no-store',
		},
	});
}

export function error(
	code: ApiErrorCode,
	status: number,
): NextResponse<ApiError> {
	return json(
		{
			error: code,
		},
		status,
	);
}

/**
 * Who is asking: the signed-in player if there is a session, otherwise the
 * anonymous cookie's. Every handler reads identity here, so none of them can
 * tell how the player arrived (§6.5).
 */
export async function playerIdFrom(
	request: NextRequest,
): Promise<string | null> {
	return (
		(await sessionPlayerId()) ??
		playerIdFromCookie(request.cookies.get(PLAYER_COOKIE)?.value)
	);
}
