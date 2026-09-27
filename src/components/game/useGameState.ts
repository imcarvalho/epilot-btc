"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shouldAsk } from "@/lib/ask-scheduler";
import type { GuessResponse, StateResponse } from "@/lib/contracts";
import type { Direction } from "@/lib/resolve-guess";
import { GUESS_WINDOW_MS } from "@/lib/resolve-guess";

export type GameStatus =
  | { kind: "loading" }
  | { kind: "ready"; state: StateResponse; clockOffset: number }
  | { kind: "error" };

/** Why the last guess did not go through, if it did not. */
export type GuessError = "price-unavailable" | "failed" | null;

/**
 * First contact is "ask for state; if there is no player yet, create one and
 * ask again". Shared across callers so a double mount (React strict mode, a
 * fast remount) cannot mint two anonymous players for one browser.
 */
let playerCreation: Promise<Response> | null = null;

async function fetchState(): Promise<StateResponse> {
  let res = await fetch("/api/state", { cache: "no-store" });
  if (res.status === 401) {
    playerCreation ??= fetch("/api/player", { method: "POST" });
    const created = await playerCreation;
    if (!created.ok) throw new Error(`player creation failed: ${created.status}`);
    res = await fetch("/api/state", { cache: "no-store" });
  }
  if (!res.ok) throw new Error(`state failed: ${res.status}`);
  return res.json();
}

/**
 * The game, from the browser's side: the server's state, placing a guess,
 * and knowing when to ask again (engineering spec §3.1). Nothing here decides
 * an outcome; the browser only says "look now" and renders what comes back.
 *
 * `clockOffset` is server time minus local time, taken from `serverNow`, so
 * the countdown runs on the server's clock (§7.2).
 */
export function useGame() {
  const [status, setStatus] = useState<GameStatus>({ kind: "loading" });
  const [watchedGuessId, setWatchedGuessId] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [guessError, setGuessError] = useState<GuessError>(null);
  const inFlight = useRef(false);

  const accept = useCallback((state: StateResponse) => {
    setStatus({ kind: "ready", state, clockOffset: state.serverNow - Date.now() });
    // A guess seen pending is one this session watches: its result is a
    // moment on screen, even if the page was reloaded mid-minute.
    if (state.pendingGuess) setWatchedGuessId(state.pendingGuess.id);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      accept(await fetchState());
    } catch {
      setStatus((current) => (current.kind === "ready" ? current : { kind: "error" }));
    } finally {
      inFlight.current = false;
    }
  }, [accept]);

  const placeGuess = useCallback(
    async (direction: Direction) => {
      setIsPlacing(true);
      setGuessError(null);
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ direction }),
        });
        if (res.status === 201) {
          const { pendingGuess, serverNow } = (await res.json()) as GuessResponse;
          setWatchedGuessId(pendingGuess.id);
          setStatus((current) =>
            current.kind === "ready"
              ? { kind: "ready", state: { ...current.state, pendingGuess, serverNow }, clockOffset: serverNow - Date.now() }
              : current,
          );
        } else if (res.status === 503) {
          setGuessError("price-unavailable");
        } else if (res.status === 409 || res.status === 401) {
          // Another tab got there first, or the player needs re-establishing:
          // either way the server's state is the answer.
          await refresh();
        } else {
          setGuessError("failed");
        }
      } catch {
        setGuessError("failed");
      } finally {
        setIsPlacing(false);
      }
    },
    [refresh],
  );

  // On mount, and whenever the tab becomes visible again.
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // The cadence around a pending guess: a pure decision, checked once a second.
  const latest = useRef(status);
  useEffect(() => {
    latest.current = status;
  }, [status]);
  useEffect(() => {
    const id = setInterval(() => {
      const current = latest.current;
      if (current.kind !== "ready") return;
      const { state, clockOffset } = current;
      const guess = state.pendingGuess;
      const now = Date.now() + clockOffset;
      const resolvableAt = guess ? guess.createdAt + GUESS_WINDOW_MS : Infinity;

      const decision = shouldAsk({
        countdownEnded: now >= resolvableAt,
        lockedPrice: guess?.priceAtGuess ?? null,
        // No browser-side ticker yet (build order item 7), so the scheduler
        // falls back to polling once the minute is up and nothing moved.
        lastTickerPrice: null,
        socketAlive: false,
        visible: document.visibilityState !== "hidden",
        msSinceLastAsk: now - state.serverNow,
        askedSinceCountdownEnded: state.serverNow >= resolvableAt,
      });
      if (decision.ask) void refresh();
    }, 1_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { status, refresh, placeGuess, isPlacing, guessError, watchedGuessId };
}

/** The current time on the server's clock, re-rendering once a second. */
export function useServerNow(clockOffset: number): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), 1_000);
    return () => clearInterval(id);
  }, [clockOffset]);
  return now;
}
