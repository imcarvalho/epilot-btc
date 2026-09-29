/**
 * Google sign-in through Auth.js (engineering spec §6.2, §6.5).
 *
 * Auth.js runs the OAuth redirect flow and checks Google's ID token's `iss`,
 * `aud` (our client id) and `exp`, with the response bound to the request by
 * PKCE and `state`. It does not check the token's signature: the token comes
 * from Google's token endpoint over TLS, not from the browser, which OpenID
 * Connect Core allows (3.1.3.7). auth.test.ts pins what is enforced.
 *
 * What is ours is what no library knows about this game:
 *
 * - identity reduces to `google:<sub>` at the boundary, and nothing else
 *   about the account is kept: the scope is `openid` alone, so Google sends
 *   no email, name or picture, and the token carries only the player id;
 * - the `signIn` callback runs the one-time anonymous merge (`signIn` in
 *   lib/game), and leaves what it did in a short-lived cookie for the next
 *   state read to report.
 *
 * The session is Auth.js's own encrypted cookie - `httpOnly`, `Secure` in
 * production, `SameSite=Lax` - keyed by `AUTH_SECRET`. Google's token is
 * discarded once verified.
 *
 * Environment: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { cookies } from 'next/headers';
import { getDeps } from '@/lib/deps';
import { signIn as signInPlayer } from '@/lib/game';
import {
	PLAYER_COOKIE,
	SIGN_IN_COOKIE,
	playerIdFromCookie,
	signInCookieOptions,
} from '@/lib/identity';

declare module 'next-auth' {
	interface Session {
		/** `google:<sub>`, the signed-in player. */
		playerId?: string;
	}
}

declare module '@auth/core/jwt' {
	interface JWT {
		playerId?: string;
	}
}

/**
 * Fixed, not sliding: the cookie is issued at sign-in and lasts this long.
 * Auth.js only re-issues a JWT session cookie when a proxy or its own
 * session endpoint handles the request, and `auth()` in a route handler
 * drops the refreshed cookie, so nothing here would extend it. After 30 days
 * the player signs in again and gets the same record back (§6.2).
 */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The whole configuration, taking extra options for the Google provider so a
 * test can point it at a fake Google (auth.test.ts). Production passes none.
 */
export function authConfig(
	googleOptions: Parameters<typeof Google>[0] = {},
): NextAuthConfig {
	return {
		providers: [
			Google({
				authorization: {
					params: {
						scope: 'openid',
					},
				},
				checks: ['pkce', 'state'],
				...googleOptions,
			}),
		],
		session: {
			strategy: 'jwt',
			maxAge: SESSION_MAX_AGE_SECONDS,
		},
		// Amplify serves the app behind its own CloudFront distribution, so the
		// host is the forwarded one.
		trustHost: true,
		callbacks: {
			async signIn({ account, profile }) {
				if (account?.provider !== 'google' || !profile?.sub) {
					return false;
				}
				const jar = await cookies();
				const outcome = await signInPlayer(
					getDeps(),
					profile.sub,
					playerIdFromCookie(jar.get(PLAYER_COOKIE)?.value),
				);
				jar.set(SIGN_IN_COOKIE, outcome, signInCookieOptions());
				return true;
			},
			// Only the player id goes into the token: nothing else from Google.
			jwt({ token, profile }) {
				if (profile?.sub) {
					return {
						playerId: `google:${profile.sub}`,
					};
				}
				return token;
			},
			session({ session, token }) {
				return {
					expires: session.expires,
					playerId: token.playerId,
				};
			},
		},
	};
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig());

/**
 * The signed-in player id, or null. With no `AUTH_SECRET` (local development
 * without Google credentials) sign-in is simply off: the game runs
 * anonymously rather than every request failing on a missing secret.
 */
export async function sessionPlayerId(): Promise<string | null> {
	if (!process.env.AUTH_SECRET) {
		return null;
	}
	return (await auth())?.playerId ?? null;
}
