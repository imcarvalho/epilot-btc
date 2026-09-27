import { NextResponse, type NextRequest } from 'next/server';
import type { ApiError, ApiErrorCode } from '@/lib/contracts';
import { PLAYER_COOKIE, playerIdFromCookie } from '@/lib/identity';

/** Game state is per player and changes by the second: nothing is cacheable. */
export function json<T>(body: T, status = 200): NextResponse<T> {
	return NextResponse.json(body, {
		status,
		headers: { 'cache-control': 'no-store' },
	});
}

export function error(
	code: ApiErrorCode,
	status: number,
): NextResponse<ApiError> {
	return json({ error: code }, status);
}

export function playerIdFrom(request: NextRequest): string | null {
	return playerIdFromCookie(request.cookies.get(PLAYER_COOKIE)?.value);
}
