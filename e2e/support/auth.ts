/**
 * A signed-in player without Google: the session cookie Auth.js would have
 * issued, minted with the e2e server's own `AUTH_SECRET`, and the player it
 * names written into the e2e table. What the sign-in flow itself does is
 * tested in src/auth.test.ts; this is for looking at the screen afterwards.
 */

import { encode } from '@auth/core/jwt';
import type { Page } from '@playwright/test';
import { seedSignedInPlayer } from './db';

/** Set on the e2e server (playwright.config.ts); never a real secret. */
export const E2E_AUTH_SECRET =
	'e2e-only-auth-secret-not-used-anywhere-else-0123';

const SESSION_COOKIE = 'authjs.session-token';

/**
 * Signs this browser in as `google:<sub>`, with a score to show. With
 * `justSignedIn`, also leaves the cookie the sign-in callback leaves, so the
 * page shows the notice a fresh sign-in gets.
 */
export async function signInAs(
	page: Page,
	sub: string,
	{
		justSignedIn = false,
		score = 0,
	}: {
		justSignedIn?: boolean;
		score?: number;
	} = {},
) {
	await seedSignedInPlayer(sub, {
		score,
	});
	const token = await encode({
		token: {
			playerId: `google:${sub}`,
		},
		secret: E2E_AUTH_SECRET,
		salt: SESSION_COOKIE,
	});
	await page.context().addCookies([
		{
			name: SESSION_COOKIE,
			value: token,
			domain: 'localhost',
			path: '/',
			httpOnly: true,
		},
		...(justSignedIn
			? [
					{
						name: 'btc_sign_in',
						value: 'promoted',
						domain: 'localhost',
						path: '/',
						httpOnly: true,
					},
				]
			: []),
	]);
}
