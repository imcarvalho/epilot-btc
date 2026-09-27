/**
 * The guess-and-resolve cycle, server side.
 *
 * Engineering spec §3 and §4. Three operations - read state, place a guess,
 * sweep - and one resolution path they share. Nothing here takes a price or a
 * time from the caller: the price is the server's cached one (§5) and the
 * clock is the server's own, both injected so tests can drive them.
 *
 * Framework-free on purpose. The route handlers are thin adapters over this.
 */

import type { Direction } from "./resolve-guess";
import { GUESS_WINDOW_MS, resolveGuess } from "./resolve-guess";
import type { PendingGuess, StateResponse } from "./contracts";
import { generateName } from "./names";
import { getGamePrice, isStale } from "./price";
import { applyResolution } from "./scoring";
import type { CachedPrice, GameStore, PlayerRecord } from "./store";

export interface GameDeps {
  store: GameStore;
  fetchPrice: () => Promise<number>;
  now: () => number;
  newId: () => string;
  random?: () => number;
}

/** How many due guesses one sweep run takes on. The next run picks up the rest. */
export const SWEEP_BATCH = 100;

export function newPlayerRecord(playerId: string, publicName: string, now: number): PlayerRecord {
  return {
    playerId,
    publicName,
    score: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    history: [],
    pendingGuess: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates an anonymous player with a generated name (rule R7: starts at 0). */
export async function createAnonymousPlayer(deps: GameDeps): Promise<PlayerRecord> {
  const player = newPlayerRecord(`anon:${deps.newId()}`, generateName(deps.random), deps.now());
  // A uuid collision is not a case worth a retry loop, but a silent overwrite
  // of someone else's record would be: the write is conditional regardless.
  if (!(await deps.store.createPlayer(player))) throw new Error("player id collision");
  return player;
}

/**
 * Resolves the player's pending guess if - and only if - the server's own
 * price says it can be. Returns the player as it now stands.
 *
 * The time passed to `resolveGuess` is when the price was observed, not when
 * this request arrived: a cached price fetched before the minute was up must
 * not settle a guess just because the request came after it. The cost is at
 * most one cache window of extra waiting.
 */
async function settleIfDue(
  deps: GameDeps,
  player: PlayerRecord,
  price: CachedPrice | null,
): Promise<{ player: PlayerRecord; settled: boolean }> {
  const pending = player.pendingGuess;
  if (!pending || !price || isStale(price, deps.now())) return { player, settled: false };

  const outcome = resolveGuess(pending, price.price, price.updatedAt);
  if (!outcome.resolved) return { player, settled: false };

  const board = applyResolution(player, pending, price.price, price.updatedAt, outcome.delta);
  const now = deps.now();

  if (await deps.store.settleGuess(player.playerId, pending.id, board, now)) {
    console.log(JSON.stringify({ event: "guess-resolved", playerId: player.playerId, delta: outcome.delta }));
    return { player: { ...player, ...board, pendingGuess: null, updatedAt: now }, settled: true };
  }

  // Someone else - another tab, or the sweep - resolved it first. Their write
  // is the one that counted; read it back rather than report our own.
  return { player: (await deps.store.getPlayer(player.playerId)) ?? player, settled: false };
}

export function toStateResponse(player: PlayerRecord, price: CachedPrice | null, now: number): StateResponse {
  return {
    publicName: player.publicName,
    score: player.score,
    stats: {
      wins: player.wins,
      losses: player.losses,
      currentStreak: player.currentStreak,
      bestStreak: player.bestStreak,
    },
    price: price?.price ?? null,
    priceUpdatedAt: price?.updatedAt ?? null,
    priceStale: isStale(price, now),
    serverNow: now,
    pendingGuess: player.pendingGuess,
    lastResult: player.history[0] ?? null,
    history: player.history,
  };
}

/** `GET /api/state`: the lazy resolution path (§3). Null if the player does not exist. */
export async function getState(deps: GameDeps, playerId: string): Promise<StateResponse | null> {
  const found = await deps.store.getPlayer(playerId);
  if (!found) return null;

  const price = await getGamePrice(deps);
  const { player } = await settleIfDue(deps, found, price);
  return toStateResponse(player, price, deps.now());
}

export type PlaceGuessResult =
  | { kind: "started"; pendingGuess: PendingGuess; serverNow: number }
  | { kind: "guess-pending" }
  | { kind: "no-player" }
  | { kind: "price-unavailable" };

/**
 * `POST /api/guess`. The caller supplies a direction and nothing else; the
 * price it is locked at and the time it starts are both the server's.
 *
 * A stale price refuses the guess outright: locking in at an old number
 * would be as unfair as resolving against one.
 */
export async function placeGuess(deps: GameDeps, playerId: string, direction: Direction): Promise<PlaceGuessResult> {
  const price = await getGamePrice(deps);
  const now = deps.now();
  if (!price || isStale(price, now)) return { kind: "price-unavailable" };

  const pendingGuess: PendingGuess = {
    id: deps.newId(),
    direction,
    priceAtGuess: price.price,
    createdAt: now,
  };

  const result = await deps.store.startGuess(playerId, pendingGuess, now);
  if (result !== "started") return { kind: result };
  return { kind: "started", pendingGuess, serverNow: now };
}

export interface SweepResult {
  due: number;
  resolved: number;
  priceStale: boolean;
}

/**
 * `POST /api/cron/resolve` (§3.2): resolves guesses left behind by closed
 * browsers. One price read, one index query, then the same conditional
 * resolution each guess would get from `GET /api/state` - so a sweep racing
 * a player's own request still settles the guess exactly once.
 */
export async function sweep(deps: GameDeps): Promise<SweepResult> {
  const price = await getGamePrice(deps);
  if (!price || isStale(price, deps.now())) return { due: 0, resolved: 0, priceStale: true };

  // Only guesses the current price can actually settle: created at least a
  // minute before that price was observed.
  const due = await deps.store.listDueGuesses(price.updatedAt - GUESS_WINDOW_MS, SWEEP_BATCH);

  const outcomes = await Promise.all(due.map((player) => settleIfDue(deps, player, price)));
  const resolved = outcomes.filter((o) => o.settled).length;

  console.log(JSON.stringify({ event: "sweep", due: due.length, resolved }));
  return { due: due.length, resolved, priceStale: false };
}
