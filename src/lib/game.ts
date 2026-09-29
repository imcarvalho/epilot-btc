/**
 * The guess-and-resolve cycle, server side.
 *
 * Engineering spec §3 and §4. Three operations - read state, place a guess,
 * sweep - and one resolution path they share. Nothing here takes a price or a
 * time from the caller: a guess locks in at a price the server reads from the
 * market as the request arrives (§5),
 * settles against the market at its deadline (§3), and the clock is the
 * server's own - all injected so tests can drive them.
 *
 * Framework-free on purpose. The route handlers are thin adapters over this.
 */

import type { Direction } from './resolve-guess';
import { GUESS_WINDOW_MS } from './resolve-guess';
import type { PendingGuess, SignInOutcome, StateResponse } from './contracts';
import { generateName } from './names';
import { lockPrice, getGamePrice, isStale, type PriceQuote } from './price';
import type { Candle } from './candles';
import { applyResolution } from './scoring';
import { TapeBackoffError } from './shared-tape';
import { deadlineOf, settleAgainstTape, type PricePoint } from './settlement';
import type { CachedPrice, GameStore, PlayerRecord } from './store';

export interface GameDeps {
	store: GameStore;
	/** One read of the ticker (price.ts). */
	fetchPrice: () => Promise<PriceQuote>;
	/** The market from a moment to now, in time order (settlement.ts). */
	fetchTape: (from: number) => Promise<PricePoint[]>;
	/** The last hour of one-minute candles ending at `now` (hour-candles.ts). */
	fetchCandles: (now: number) => Promise<Candle[]>;
	now: () => number;
	newId: () => string;
	random?: () => number;
}

/** How many due guesses one sweep run takes on. The next run picks up the rest. */
const SWEEP_BATCH = 100;

export function newPlayerRecord(
	playerId: string,
	publicName: string,
	now: number,
): PlayerRecord {
	return {
		playerId,
		publicName,
		score: 0,
		wins: 0,
		losses: 0,
		currentStreak: 0,
		previousStreak: 0,
		bestStreak: 0,
		history: [],
		pendingGuess: null,
		onBoard: false,
		createdAt: now,
		updatedAt: now,
	};
}

/** Creates an anonymous player with a generated name (rule R7: starts at 0). */
export async function createAnonymousPlayer(
	deps: GameDeps,
): Promise<PlayerRecord> {
	const player = newPlayerRecord(
		`anon:${deps.newId()}`,
		generateName(deps.random),
		deps.now(),
	);
	// A uuid collision is not a case worth a retry loop, but a silent overwrite
	// of someone else's record would be: the write is conditional regardless.
	if (!(await deps.store.createPlayer(player))) {
		throw new Error('player id collision');
	}
	return player;
}

/**
 * Conflicts are retried this many times: a guess settling mid-merge, a
 * double click, other sign-ins adding to the one board total at the same
 * moment. Each retry waits a little longer, with jitter, so those sign-ins
 * do not all collide again.
 */
const SIGN_IN_ATTEMPTS = 5;
const SIGN_IN_BACKOFF_MS = 25;

/**
 * Signs a Google account in, carrying this browser's anonymous player over
 * once - its name and any guess in play, not its score (§6.2). Every path ends in a conditional write, so two sign-ins racing each
 * other (a double click, two tabs) merge once and the loser re-reads.
 *
 * Joining the board happens here and only here: the signed-in record is
 * written with the `board` attribute and counted in the total in the same
 * transaction.
 *
 * `rejoin` is for a session whose record has gone missing: it was counted
 * when it first joined, so writing it back leaves the total alone. The
 * total only ever moves for a player's first join.
 */
export async function signIn(
	deps: GameDeps,
	googleSub: string,
	anonId: string | null,
	options: { rejoin?: boolean } = {},
): Promise<SignInOutcome> {
	const playerId = `google:${googleSub}`;
	for (let attempt = 0; attempt < SIGN_IN_ATTEMPTS; attempt++) {
		if (attempt > 0) {
			await new Promise((resolve) => {
				setTimeout(
					resolve,
					SIGN_IN_BACKOFF_MS * attempt * (0.5 + (deps.random ?? Math.random)()),
				);
			});
		}
		const [account, anon] = await Promise.all([
			deps.store.getPlayer(playerId),
			anonId?.startsWith('anon:') ? deps.store.getPlayer(anonId) : null,
		]);

		if (account) {
			const played = anon && (anon.wins + anon.losses > 0 || anon.pendingGuess);
			return played ? 'kept-existing' : 'returning';
		}

		const now = deps.now();
		// The board counts only what is earned while signed in (§6.2), so the
		// anonymous record brings its name, its age and any guess in play, and
		// no score, counters or history: those start at zero. A guess still
		// pending settles after this write, so it counts.
		const player: PlayerRecord = anon
			? {
					...newPlayerRecord(playerId, anon.publicName, now),
					pendingGuess: anon.pendingGuess,
					createdAt: anon.createdAt,
					onBoard: true,
				}
			: {
					...newPlayerRecord(playerId, generateName(deps.random), now),
					onBoard: true,
				};
		if (
			await deps.store.createSignedInPlayer(
				player,
				anon,
				options.rejoin ?? false,
			)
		) {
			console.log(
				JSON.stringify({
					event: 'signed-in',
					outcome: anon ? 'promoted' : 'created',
				}),
			);
			return anon ? 'promoted' : 'created';
		}
		// Something moved between the read and the write; read again.
	}
	throw new Error('sign-in kept conflicting');
}

/**
 * The market from `from` to now, or null if Coinbase cannot be read - in
 * which case nothing settles and the next ask tries again.
 */
async function readTape(
	deps: GameDeps,
	from: number,
): Promise<PricePoint[] | null> {
	try {
		return await deps.fetchTape(from);
	} catch (error) {
		// Backing off is the shared read declining to call Coinbase again, not
		// a new failure: the attempt that failed has already been logged.
		if (!(error instanceof TapeBackoffError)) {
			console.error(
				JSON.stringify({
					event: 'tape-fetch-failed',
					error: String(error),
				}),
			);
		}
		return null;
	}
}

/**
 * Resolves the player's pending guess if - and only if - the market at its
 * deadline says it can be. Returns the player as it now stands.
 *
 * The price is the one standing at the deadline, read from the trade tape
 * (settlement.ts), so every trigger - this player's read, another tab, the
 * sweep - reaches the same outcome however late it arrives.
 */
async function settleIfDue(
	deps: GameDeps,
	player: PlayerRecord,
	tape: PricePoint[] | null,
): Promise<{ player: PlayerRecord; settled: boolean }> {
	const pending = player.pendingGuess;
	if (!pending || !tape) {
		return {
			player,
			settled: false,
		};
	}

	const settlement = settleAgainstTape(pending, tape);
	if (!settlement.resolved) {
		return {
			player,
			settled: false,
		};
	}

	const board = applyResolution(
		player,
		pending,
		settlement.price,
		settlement.at,
		settlement.delta,
	);
	const now = deps.now();

	if (await deps.store.settleGuess(player.playerId, pending.id, board, now)) {
		console.log(
			JSON.stringify({
				event: 'guess-resolved',
				playerId: player.playerId,
				delta: settlement.delta,
			}),
		);
		return {
			player: {
				...player,
				...board,
				pendingGuess: null,
				updatedAt: now,
			},
			settled: true,
		};
	}

	// Someone else - another tab, or the sweep - resolved it first. Their write
	// is the one that counted; read it back rather than report our own.
	return {
		player: (await deps.store.getPlayer(player.playerId)) ?? player,
		settled: false,
	};
}

function toStateResponse(
	player: PlayerRecord,
	price: CachedPrice | null,
	now: number,
	settlementDelayed: boolean,
): StateResponse {
	return {
		publicName: player.publicName,
		score: player.score,
		stats: {
			wins: player.wins,
			losses: player.losses,
			currentStreak: player.currentStreak,
			previousStreak: player.previousStreak,
			bestStreak: player.bestStreak,
		},
		price: price?.price ?? null,
		priceUpdatedAt: price?.updatedAt ?? null,
		priceStale: isStale(price, now),
		settlementDelayed,
		serverNow: now,
		pendingGuess: player.pendingGuess,
		lastResult: player.history[0] ?? null,
		history: player.history,
		signedIn: player.onBoard,
	};
}

/** A player's state, read by the game stream every second: the lazy resolution path (§3). Null if the player does not exist. */
export async function getState(
	deps: GameDeps,
	playerId: string,
): Promise<StateResponse | null> {
	const found = await deps.store.getPlayer(playerId);
	if (!found) {
		return null;
	}

	// The tape is read only once the minute is up: before then there is
	// nothing it could settle.
	const deadline = found.pendingGuess ? deadlineOf(found.pendingGuess) : null;
	const dueFrom = deadline !== null && deps.now() >= deadline ? deadline : null;
	const [price, tape] = await Promise.all([
		getGamePrice(deps),
		dueFrom !== null ? readTape(deps, dueFrom) : null,
	]);
	const { player } = await settleIfDue(deps, found, tape);
	// Due but no tape: the history could not be read, whatever the ticker
	// says. A guess that settled or raced away has no pending guess left.
	const settlementDelayed =
		dueFrom !== null && tape === null && player.pendingGuess !== null;
	return toStateResponse(player, price, deps.now(), settlementDelayed);
}

export type PlaceGuessResult =
	| { kind: 'started'; pendingGuess: PendingGuess; serverNow: number }
	| { kind: 'guess-pending' }
	| { kind: 'no-player' }
	| { kind: 'price-unavailable' };

/**
 * `POST /api/guess`. The caller supplies a direction and nothing else; the
 * price it is locked at and the time it starts are both the server's.
 *
 * The price is read from the market for this request or, at most a quarter
 * of a second old, from another guess's read (`lockPrice`), never from the
 * screen's cache. A failed read, or one the global cap on Coinbase calls
 * has no slot for, refuses the guess rather than falling back: a price even
 * a few seconds old is one the player may already have seen the market move
 * away from (§5, "The locked price"). `createdAt` is when that price stood,
 * so the deadline is exactly a minute after the locked trade.
 */
export async function placeGuess(
	deps: GameDeps,
	playerId: string,
	direction: Direction,
): Promise<PlaceGuessResult> {
	// A cheap read first, so a player who cannot guess costs no Coinbase call.
	// It decides nothing: the conditional write below is what enforces R3.
	const player = await deps.store.getPlayer(playerId);
	if (!player) {
		return {
			kind: 'no-player',
		};
	}
	if (player.pendingGuess) {
		return {
			kind: 'guess-pending',
		};
	}

	const price = await lockPrice(deps);
	if (!price) {
		return {
			kind: 'price-unavailable',
		};
	}
	const now = deps.now();

	const pendingGuess: PendingGuess = {
		id: deps.newId(),
		direction,
		priceAtGuess: price.price,
		createdAt: price.updatedAt,
	};

	const result = await deps.store.startGuess(playerId, pendingGuess, now);
	if (result !== 'started') {
		return {
			kind: result,
		};
	}
	return {
		kind: 'started',
		pendingGuess,
		serverNow: now,
	};
}

export interface SweepResult {
	due: number;
	resolved: number;
	priceStale: boolean;
}

/**
 * `POST /api/cron/resolve` (§3.2): resolves guesses left behind by closed
 * browsers. One index query, one read of the market back to the oldest
 * deadline, then the same conditional resolution each guess would get from
 * the game stream's state read - so a sweep racing a player's own request still settles
 * the guess exactly once, and against the same price.
 */
export async function sweep(deps: GameDeps): Promise<SweepResult> {
	const due = await deps.store.listDueGuesses(
		deps.now() - GUESS_WINDOW_MS,
		SWEEP_BATCH,
	);
	if (due.length === 0) {
		return {
			due: 0,
			resolved: 0,
			priceStale: false,
		};
	}

	const oldest = Math.min(
		...due.flatMap((p) => (p.pendingGuess ? [deadlineOf(p.pendingGuess)] : [])),
	);
	const tape = await readTape(deps, oldest);
	if (!tape) {
		console.error(
			JSON.stringify({
				event: 'sweep-stalled',
				due: due.length,
			}),
		);
		return {
			due: due.length,
			resolved: 0,
			priceStale: true,
		};
	}

	const outcomes = await Promise.all(
		due.map((player) => settleIfDue(deps, player, tape)),
	);
	const resolved = outcomes.filter((o) => o.settled).length;

	console.log(
		JSON.stringify({
			event: 'sweep',
			due: due.length,
			resolved,
		}),
	);
	return {
		due: due.length,
		resolved,
		priceStale: false,
	};
}
