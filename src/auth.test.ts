/**
 * Google sign-in, end to end through the real Auth.js handlers (engineering
 * spec §9): a fake Google hands back id tokens, and what the app does with
 * each is checked at the two places that matter - whether a session cookie is
 * issued, and whether the game's sign-in ran.
 */

import { NextRequest } from 'next/server';
import { decode } from '@auth/core/jwt';
import { customFetch } from 'next-auth';
import type { GameDeps } from '@/lib/game';
import { MemoryStore } from '@/lib/testing/memory-store';
import {
	createFakeGoogle,
	type IdTokenOptions,
} from '@/lib/testing/fake-google';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const AUTH_SECRET = 'test-auth-secret-of-sufficient-length-0123456789';
const ORIGIN = 'http://localhost:3000';

let store: MemoryStore;
let jar: Map<string, string>;
const cookiesSet: [string, string][] = [];

vi.mock('next/headers', () => ({
	cookies: async () => ({
		get: (name: string) => {
			const value = jar.get(name);
			return value === undefined
				? undefined
				: {
						name,
						value,
					};
		},
		set: (name: string, value: string) => {
			cookiesSet.push([name, value]);
		},
	}),
}));

vi.mock('@/lib/deps', () => ({
	getDeps: (): GameDeps => ({
		store,
		fetchCandles: async () => [],
		now: () => 1_700_000_000_000,
		newId: () => '00000000-0000-4000-8000-000000000001',
		fetchPrice: async () => ({
			price: 100_000,
			time: 1_700_000_000_000,
		}),
		fetchTape: async () => [],
	}),
}));

const google = createFakeGoogle(CLIENT_ID);

beforeEach(() => {
	store = new MemoryStore();
	jar = new Map();
	cookiesSet.length = 0;
	vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
	vi.stubEnv('AUTH_GOOGLE_ID', CLIENT_ID);
	vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-client-secret');
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function handlers() {
	const { authConfig } = await import('@/auth');
	const NextAuth = (await import('next-auth')).default;
	return NextAuth(
		authConfig({
			[customFetch]: google.fetch,
		}),
	).handlers;
}

/** Cookies a response sets, as a name -> value map. */
function setCookies(response: Response) {
	const out = new Map<string, string>();
	for (const line of response.headers.getSetCookie()) {
		const [pair] = line.split(';');
		const at = pair.indexOf('=');
		out.set(pair.slice(0, at), pair.slice(at + 1));
	}
	return out;
}

const header = (cookies: Map<string, string>) =>
	[...cookies].map(([name, value]) => `${name}=${value}`).join('; ');

/**
 * The browser's half of "Sign in with Google": ask to sign in, receive the
 * redirect to Google with its state and PKCE cookies, then come back with a
 * code. Returns what the callback answered.
 */
async function signInWithGoogle(
	token: IdTokenOptions,
	{
		state,
		without = [],
	}: {
		/** Come back with this state instead of the one that was issued. */
		state?: string;
		/** Flow cookies the browser fails to send back (by name fragment). */
		without?: string[];
	} = {},
) {
	const { GET, POST } = await handlers();
	google.respondWith(token);

	const csrf = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
	const csrfCookies = setCookies(csrf);
	const { csrfToken } = await csrf.json();

	const start = await POST(
		new NextRequest(`${ORIGIN}/api/auth/signin/google`, {
			method: 'POST',
			headers: {
				cookie: header(csrfCookies),
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				csrfToken,
				callbackUrl: `${ORIGIN}/`,
			}),
		}),
	);
	const toGoogle = new URL(start.headers.get('location')!);
	expect(toGoogle.origin + toGoogle.pathname).toBe(
		'https://accounts.google.com/o/oauth2/v2/auth',
	);
	expect(toGoogle.searchParams.get('scope')).toBe('openid');
	const flowCookies = new Map(
		[...csrfCookies, ...setCookies(start)].filter(
			([name]) => !without.some((fragment) => name.includes(fragment)),
		),
	);

	const back = await GET(
		new NextRequest(
			`${ORIGIN}/api/auth/callback/google?${new URLSearchParams({
				code: 'fake-code',
				state: state ?? toGoogle.searchParams.get('state')!,
			})}`,
			{
				headers: {
					cookie: header(flowCookies),
				},
			},
		),
	);
	return {
		response: back,
		cookies: setCookies(back),
		location: back.headers.get('location') ?? '',
	};
}

const SESSION_COOKIE = 'authjs.session-token';

describe('Google sign-in through Auth.js', () => {
	it('issues a session for a valid token, holding only the player id', async () => {
		const { cookies, location } = await signInWithGoogle({
			sub: 'abc123',
			claims: {
				email: 'someone@example.com',
				name: 'Someone Real',
				picture: 'https://example.com/me.png',
			},
		});

		expect(location).toBe(`${ORIGIN}/`);
		const session = await decode({
			token: cookies.get(SESSION_COOKIE),
			secret: AUTH_SECRET,
			salt: SESSION_COOKIE,
		});
		expect(session).toMatchObject({
			playerId: 'google:abc123',
		});
		const held = JSON.stringify(session);
		expect(held).not.toContain('someone@example.com');
		expect(held).not.toContain('Someone Real');
		expect(held).not.toContain('me.png');
	});

	it('runs the game sign-in once, putting the account on the board', async () => {
		await signInWithGoogle({
			sub: 'abc123',
		});

		expect(store.players.get('google:abc123')).toMatchObject({
			onBoard: true,
		});
		await expect(store.getBoardTotal()).resolves.toBe(1);
		expect(cookiesSet).toEqual([['btc_sign_in', 'created']]);
	});

	it('carries the anonymous name across, but not its score', async () => {
		const anon = 'anon:00000000-0000-4000-8000-0000000000aa';
		const { newPlayerRecord } = await import('@/lib/game');
		await store.createPlayer({
			...newPlayerRecord(anon, 'PatientHeron', 1_000),
			score: 3,
			wins: 3,
		});
		jar.set('btc_player', anon.slice('anon:'.length));

		await signInWithGoogle({
			sub: 'abc123',
		});

		expect(store.players.has(anon)).toBe(false);
		expect(store.players.get('google:abc123')).toMatchObject({
			score: 0,
			wins: 0,
			publicName: 'PatientHeron',
		});
		expect(cookiesSet).toEqual([['btc_sign_in', 'promoted']]);
	});

	describe.each([
		[
			'issued to another client (wrong audience)',
			{
				aud: 'someone-elses-client-id',
			},
		],
		[
			'from another issuer',
			{
				iss: 'https://evil.example.com',
			},
		],
		[
			'expired',
			{
				expiresIn: -3600,
			},
		],
		[
			'without a subject',
			{
				sub: null,
			},
		],
	] as [string, IdTokenOptions][])('a token %s', (_, token) => {
		it('is refused: no session, and the game is not touched', async () => {
			const { cookies, location } = await signInWithGoogle(token);

			expect(cookies.has(SESSION_COOKIE)).toBe(false);
			expect(location).toContain('/api/auth/error');
			expect(store.players.size).toBe(0);
			await expect(store.getBoardTotal()).resolves.toBe(0);
			expect(cookiesSet).toEqual([]);
		});
	});

	it('refuses a callback whose state is not the one issued', async () => {
		const { cookies, location } = await signInWithGoogle(
			{
				sub: 'abc123',
			},
			{
				state: 'forged-state',
			},
		);

		expect(cookies.has(SESSION_COOKIE)).toBe(false);
		expect(location).toContain('/api/auth/error');
		expect(store.players.size).toBe(0);
	});

	it('refuses a callback that comes back without the PKCE cookie it started with', async () => {
		const { cookies, location } = await signInWithGoogle(
			{
				sub: 'abc123',
			},
			{
				without: ['pkce'],
			},
		);

		expect(cookies.has(SESSION_COOKIE)).toBe(false);
		expect(location).toContain('/api/auth/error');
		expect(store.players.size).toBe(0);
	});

	it('refuses a callback that comes back without the state cookie it started with', async () => {
		const { cookies, location } = await signInWithGoogle(
			{
				sub: 'abc123',
			},
			{
				without: ['state'],
			},
		);

		expect(cookies.has(SESSION_COOKIE)).toBe(false);
		expect(location).toContain('/api/auth/error');
		expect(store.players.size).toBe(0);
	});
});

/** Our own callbacks, on their own, for the inputs the flow above cannot produce. */
describe('the callbacks this app owns', () => {
	async function callbacks() {
		const { authConfig } = await import('@/auth');
		return authConfig().callbacks!;
	}

	it('sign in only a Google account that has a subject', async () => {
		const { signIn } = await callbacks();
		const args = (provider: string, profile: object) =>
			({
				account: {
					provider,
				},
				profile,
			}) as never;

		await expect(
			signIn!(
				args('github', {
					sub: 'abc',
				}),
			),
		).resolves.toBe(false);
		await expect(signIn!(args('google', {}))).resolves.toBe(false);
		expect(store.players.size).toBe(0);
		expect(cookiesSet).toEqual([]);
	});

	it('reduce the token to the player id, whatever the profile carries', async () => {
		const { jwt } = await callbacks();
		expect(
			jwt!({
				token: {
					email: 'a@b.c',
				},
				profile: {
					sub: 'abc',
					email: 'a@b.c',
					name: 'Someone Real',
				},
			} as never),
		).toEqual({
			playerId: 'google:abc',
		});
	});

	it('keep the token as it is on the requests after sign-in', async () => {
		const { jwt } = await callbacks();
		const token = {
			playerId: 'google:abc',
		};
		expect(
			jwt!({
				token,
			} as never),
		).toEqual(token);
	});

	it('put only the player id and expiry in the session', async () => {
		const { session } = await callbacks();
		expect(
			await session!({
				session: {
					expires: '2030-01-01T00:00:00.000Z',
					user: {
						name: 'Someone Real',
					},
				},
				token: {
					playerId: 'google:abc',
					email: 'a@b.c',
				},
			} as never),
		).toEqual({
			expires: '2030-01-01T00:00:00.000Z',
			playerId: 'google:abc',
		});
	});
});
