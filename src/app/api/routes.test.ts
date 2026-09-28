/**
 * The route handlers called as plain functions (engineering spec §9), over
 * the in-memory store. These check the HTTP edge only - cookies, status
 * codes, the strict body - since the game rules are covered in lib/game.
 */

import { NextRequest } from 'next/server';
import type { GameDeps } from '@/lib/game';
import { signIn } from '@/lib/game';
import { MemoryStore } from '@/lib/testing/memory-store';
import { POST as createPlayer } from './player/route';
import { GET as getState } from './state/route';
import { POST as guess } from './guess/route';
import { POST as resolve } from './cron/resolve/route';
import { GET as leaderboard } from './leaderboard/route';
import { GET as streamTicket } from './stream-token/route';
import { verifyStreamToken } from '@/lib/stream-token';

const T0 = 1_700_000_000_000;
let clock = T0;
let ids = 0;
let feedUp = true;
let store: MemoryStore;
let session: { playerId?: string } | null = null;

vi.mock('@/auth', () => ({
	sessionPlayerId: async () => session?.playerId ?? null,
}));

vi.mock('@/lib/deps', () => ({
	getDeps: (): GameDeps => ({
		store,
		fetchCandles: async () => [],
		now: () => clock,
		newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
		fetchPrice: async () => {
			if (!feedUp) {
				throw new Error('feed down');
			}
			return {
				price: 100_000,
				time: clock,
			};
		},
		fetchTape: async () => {
			if (!feedUp) {
				throw new Error('feed down');
			}
			return [
				{
					time: T0,
					price: 100_000,
				},
			];
		},
	}),
}));

beforeEach(() => {
	store = new MemoryStore();
	clock = T0;
	ids = 0;
	feedUp = true;
	session = null;
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

function request(
	path: string,
	init: {
		method?: string;
		cookie?: string;
		/** Extra cookies, as `name=value; name=value`. */
		cookies?: string;
		body?: unknown;
		headers?: Record<string, string>;
	} = {},
) {
	const headers = new Headers(init.headers);
	const cookies = [
		init.cookie ? `btc_player=${init.cookie}` : null,
		init.cookies ?? null,
	].filter(Boolean);
	if (cookies.length) {
		headers.set('cookie', cookies.join('; '));
	}
	return new NextRequest(`http://localhost${path}`, {
		method: init.method ?? 'GET',
		headers,
		body:
			init.body === undefined
				? undefined
				: typeof init.body === 'string'
					? init.body
					: JSON.stringify(init.body),
	});
}

async function newPlayerCookie(): Promise<string> {
	const res = await createPlayer(
		request('/api/player', {
			method: 'POST',
		}),
	);
	return res.cookies.get('btc_player')!.value;
}

describe('POST /api/player', () => {
	it('creates a player and sets an httpOnly, SameSite=Lax cookie', async () => {
		const res = await createPlayer(
			request('/api/player', {
				method: 'POST',
			}),
		);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			publicName: expect.stringMatching(/^[A-Z][a-z]+[A-Z][a-z]+$/),
		});

		const setCookie = res.headers.get('set-cookie')!;
		expect(setCookie).toMatch(/^btc_player=[0-9a-f-]{36};/);
		expect(setCookie).toMatch(/HttpOnly/i);
		expect(setCookie).toMatch(/SameSite=lax/i);
		expect(store.players.size).toBe(1);
	});

	it('is idempotent for a browser that already has a player', async () => {
		const cookie = await newPlayerCookie();
		const res = await createPlayer(
			request('/api/player', {
				method: 'POST',
				cookie,
			}),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(store.players.size).toBe(1);
	});

	it('replaces a cookie whose player no longer exists', async () => {
		const res = await createPlayer(
			request('/api/player', {
				method: 'POST',
				cookie: '11111111-1111-4111-8111-111111111111',
			}),
		);
		expect(res.status).toBe(201);
		expect(res.cookies.get('btc_player')!.value).not.toBe(
			'11111111-1111-4111-8111-111111111111',
		);
	});
});

describe('GET /api/state', () => {
	it('is 401 without a player cookie', async () => {
		const res = await getState(request('/api/state'));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error: 'no-player',
		});
	});

	it('is 401 for a malformed cookie, without touching the store', async () => {
		const res = await getState(
			request('/api/state', {
				cookie: 'PRICE#BTCUSD',
			}),
		);
		expect(res.status).toBe(401);
	});

	it('returns the state with server time, and is never cached', async () => {
		const cookie = await newPlayerCookie();
		const res = await getState(
			request('/api/state', {
				cookie,
			}),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(await res.json()).toMatchObject({
			score: 0,
			price: 100_000,
			serverNow: T0,
			pendingGuess: null,
		});
	});
});

describe('POST /api/guess', () => {
	it("starts a guess at the server's price", async () => {
		const cookie = await newPlayerCookie();
		const res = await guess(
			request('/api/guess', {
				method: 'POST',
				cookie,
				body: {
					direction: 'up',
				},
			}),
		);
		expect(res.status).toBe(201);
		expect(await res.json()).toMatchObject({
			pendingGuess: {
				direction: 'up',
				priceAtGuess: 100_000,
				createdAt: T0,
			},
			serverNow: T0,
		});
	});

	it('rejects a body that tries to carry a price or a timestamp', async () => {
		const cookie = await newPlayerCookie();
		for (const body of [
			{
				direction: 'up',
				priceAtGuess: 1,
			},
			{
				direction: 'up',
				createdAt: 0,
			},
		]) {
			const res = await guess(
				request('/api/guess', {
					method: 'POST',
					cookie,
					body,
				}),
			);
			expect(res.status).toBe(400);
		}
		expect([...store.players.values()][0].pendingGuess).toBeNull();
	});

	it('rejects anything but up or down, and a body that is not JSON', async () => {
		const cookie = await newPlayerCookie();
		for (const body of [
			{
				direction: 'sideways',
			},
			{},
			'not json',
		]) {
			const res = await guess(
				request('/api/guess', {
					method: 'POST',
					cookie,
					body,
				}),
			);
			expect(res.status).toBe(400);
		}
	});

	it('returns 409 for a second guess while one is pending', async () => {
		const cookie = await newPlayerCookie();
		await guess(
			request('/api/guess', {
				method: 'POST',
				cookie,
				body: {
					direction: 'up',
				},
			}),
		);
		const res = await guess(
			request('/api/guess', {
				method: 'POST',
				cookie,
				body: {
					direction: 'down',
				},
			}),
		);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			error: 'guess-pending',
		});
	});

	it('is 401 without a player', async () => {
		const res = await guess(
			request('/api/guess', {
				method: 'POST',
				body: {
					direction: 'up',
				},
			}),
		);
		expect(res.status).toBe(401);
	});

	it('is 503 when the price feed is stale', async () => {
		const cookie = await newPlayerCookie();
		feedUp = false;
		clock += 60_000;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await guess(
			request('/api/guess', {
				method: 'POST',
				cookie,
				body: {
					direction: 'up',
				},
			}),
		);
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({
			error: 'price-unavailable',
		});
	});
});

describe('POST /api/cron/resolve', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('rejects a request without the shared secret', async () => {
		vi.stubEnv('CRON_SECRET', 's3cret');
		const res = await resolve(
			request('/api/cron/resolve', {
				method: 'POST',
			}),
		);
		expect(res.status).toBe(401);
	});

	it('rejects a wrong secret', async () => {
		vi.stubEnv('CRON_SECRET', 's3cret');
		const res = await resolve(
			request('/api/cron/resolve', {
				method: 'POST',
				headers: {
					'x-cron-secret': 'guess',
				},
			}),
		);
		expect(res.status).toBe(401);
	});

	it('rejects everything when no secret is configured', async () => {
		vi.stubEnv('CRON_SECRET', '');
		const res = await resolve(
			request('/api/cron/resolve', {
				method: 'POST',
				headers: {
					'x-cron-secret': '',
				},
			}),
		);
		expect(res.status).toBe(401);
	});

	it('sweeps with the right secret', async () => {
		vi.stubEnv('CRON_SECRET', 's3cret');
		const res = await resolve(
			request('/api/cron/resolve', {
				method: 'POST',
				headers: {
					'x-cron-secret': 's3cret',
				},
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			due: 0,
			resolved: 0,
			priceStale: false,
		});
	});
});

describe('GET /api/stream-token', () => {
	beforeEach(() => {
		vi.stubEnv('STREAM_URL', 'https://stream.example/');
		vi.stubEnv('STREAM_SECRET', 'stream-secret');
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('issues a ticket naming the caller, and never cacheable', async () => {
		const cookie = await newPlayerCookie();
		const res = await streamTicket(
			request('/api/stream-token', {
				cookie,
			}),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		const { url, token } = await res.json();
		expect(url).toBe('https://stream.example/');
		expect(verifyStreamToken(token, 'stream-secret', clock)).toMatch(/^anon:/);
	});

	it('is 401 without a player', async () => {
		const res = await streamTicket(request('/api/stream-token'));
		expect(res.status).toBe(401);
	});

	it('is 503 when the stream is not configured', async () => {
		vi.stubEnv('STREAM_SECRET', '');
		const cookie = await newPlayerCookie();
		const res = await streamTicket(
			request('/api/stream-token', {
				cookie,
			}),
		);
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({
			error: 'stream-unavailable',
		});
	});
});

describe('GET /api/leaderboard', () => {
	it('answers without a player, with no row of theirs', async () => {
		const res = await leaderboard(request('/api/leaderboard'));
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(await res.json()).toEqual({
			podium: [],
			you: null,
			total: 0,
			isEligible: false,
		});
	});

	it('tells an anonymous player they are not on the board', async () => {
		const cookie = await newPlayerCookie();
		const res = await leaderboard(
			request('/api/leaderboard', {
				cookie,
			}),
		);
		expect(await res.json()).toMatchObject({
			isEligible: false,
			you: null,
		});
	});
});

describe('signed in', () => {
	const deps = (): GameDeps => ({
		store,
		fetchCandles: async () => [],
		now: () => clock,
		newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
		fetchPrice: async () => ({
			price: 100_000,
			time: clock,
		}),
		fetchTape: async () => [],
	});

	it('reads the session before the anonymous cookie', async () => {
		const cookie = await newPlayerCookie();
		await guess(
			request('/api/guess', {
				method: 'POST',
				cookie,
				body: {
					direction: 'up',
				},
			}),
		);
		await signIn(deps(), 'sub-1', `anon:${cookie}`);
		session = {
			playerId: 'google:sub-1',
		};

		const res = await getState(
			request('/api/state', {
				cookie,
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			signedIn: true,
			pendingGuess: {
				direction: 'up',
			},
		});
	});

	it('reports what sign-in did once, then clears it', async () => {
		await signIn(deps(), 'sub-1', null);
		session = {
			playerId: 'google:sub-1',
		};

		const first = await getState(
			request('/api/state', {
				cookies: 'btc_sign_in=promoted',
			}),
		);
		expect((await first.json()).signIn).toBe('promoted');
		expect(first.headers.get('set-cookie')).toMatch(/^btc_sign_in=;/);

		const next = await getState(request('/api/state'));
		expect((await next.json()).signIn).toBeNull();
	});

	it('ignores a sign-in report without a session, or one it does not know', async () => {
		const cookie = await newPlayerCookie();
		const anon = await getState(
			request('/api/state', {
				cookie,
				cookies: 'btc_sign_in=promoted',
			}),
		);
		expect(await anon.json()).toMatchObject({
			signedIn: false,
			signIn: null,
		});

		await signIn(deps(), 'sub-1', null);
		session = {
			playerId: 'google:sub-1',
		};
		const odd = await getState(
			request('/api/state', {
				cookies: 'btc_sign_in=admin',
			}),
		);
		expect((await odd.json()).signIn).toBeNull();
	});

	it('recreates a signed-in account whose record is missing, rather than going anonymous', async () => {
		session = {
			playerId: 'google:sub-1',
		};
		const res = await createPlayer(
			request('/api/player', {
				method: 'POST',
			}),
		);
		expect(res.status).toBe(201);
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(store.players.get('google:sub-1')).toMatchObject({
			onBoard: true,
		});
	});

	it('puts the signed-in player on the leaderboard as you', async () => {
		await signIn(deps(), 'sub-1', null);
		session = {
			playerId: 'google:sub-1',
		};
		const body = await (await leaderboard(request('/api/leaderboard'))).json();
		expect(body).toMatchObject({
			isEligible: true,
			total: 1,
		});
		expect(body.podium[0].isYou).toBe(true);
		expect(JSON.stringify(body)).not.toContain('sub-1');
	});
});
