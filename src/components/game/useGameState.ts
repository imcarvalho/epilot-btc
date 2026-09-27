"use client";

import { useCallback, useEffect, useState } from "react";
import type { StateResponse } from "@/lib/contracts";

export type GameStatus =
  | { kind: "loading" }
  | { kind: "ready"; state: StateResponse; clockOffset: number }
  | { kind: "error" };

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
 * The game state, from the server and nothing else (engineering spec §1).
 * Read on mount and whenever the tab becomes visible again (§3.1); the
 * cadence around a pending guess arrives with the waiting states.
 *
 * `clockOffset` is server time minus local time, taken from `serverNow`, so
 * anything time-based on screen runs on the server's clock (§7.2).
 */
export function useGameState() {
  const [status, setStatus] = useState<GameStatus>({ kind: "loading" });

  const refresh = useCallback(async () => {
    try {
      const state = await fetchState();
      setStatus({ kind: "ready", state, clockOffset: state.serverNow - Date.now() });
    } catch {
      setStatus((current) => (current.kind === "ready" ? current : { kind: "error" }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { status, refresh };
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
