/**
 * Anonymous identity (engineering spec §6.1): an opaque id in an `httpOnly`
 * cookie. JavaScript never reads it and no request body carries it, so the
 * client has nothing to tamper with beyond the cookie itself - and a forged
 * cookie only plays as another player, it cannot change a price or a score.
 *
 * The cookie holds the bare uuid; the `anon:` prefix is added here, so a
 * cookie can never name a `google:` player or the price cache item.
 */

import { z } from 'zod';

export const PLAYER_COOKIE = 'btc_player';

const ANON_PREFIX = 'anon:';

/** Browsers cap cookie lifetime at 400 days; the item's own TTL (§8) is shorter. */
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const CookieValueSchema = z.uuid();

/** The playerId a cookie value names, or null if it is missing or malformed. */
export function playerIdFromCookie(value: string | undefined): string | null {
	const parsed = CookieValueSchema.safeParse(value);
	return parsed.success ? `${ANON_PREFIX}${parsed.data}` : null;
}

export function cookieValueFor(playerId: string): string {
	if (!playerId.startsWith(ANON_PREFIX))
		throw new Error(`not an anonymous player: ${playerId}`);
	return playerId.slice(ANON_PREFIX.length);
}

export function playerCookieOptions(
	production = process.env.NODE_ENV === 'production',
) {
	return {
		httpOnly: true,
		secure: production,
		sameSite: 'lax' as const,
		path: '/',
		maxAge: COOKIE_MAX_AGE_SECONDS,
	};
}
