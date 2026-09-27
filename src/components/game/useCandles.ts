"use client";

import { useEffect, useRef, useState } from "react";
import { MINUTE_MS, candlesUrl, parseCandles, type Candle } from "@/lib/candles";

export type CandlesState =
  | { kind: "loading" }
  | { kind: "ready"; candles: Candle[]; windowEnd: number }
  | { kind: "error" };

/** A few seconds past the minute, so Coinbase has closed the candle. */
const SETTLE_MS = 2_000;

/**
 * The last hour of candles, straight from Coinbase (engineering spec §5).
 * Fetched on mount and again just after each minute turns, and only while
 * the tab is visible: a hidden tab asks for nothing, and catches up the
 * moment it is shown again.
 *
 * `no-store` because Coinbase marks these responses cacheable for five
 * minutes, which would freeze the chart.
 */
export function useCandles(): CandlesState {
  const [state, setState] = useState<CandlesState>({ kind: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      clearTimeout(timer.current);
      const now = Date.now();
      try {
        const res = await fetch(candlesUrl(now), { cache: "no-store" });
        if (!res.ok) throw new Error(`candles ${res.status}`);
        const candles = parseCandles(await res.json());
        if (!cancelled) setState({ kind: "ready", candles, windowEnd: now });
      } catch {
        // Keep the last good chart on a failed refresh; only an empty one
        // becomes an error.
        if (!cancelled) setState((s) => (s.kind === "ready" ? s : { kind: "error" }));
      }
      if (!cancelled && document.visibilityState === "visible") {
        const untilNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS) + SETTLE_MS;
        timer.current = setTimeout(load, untilNextMinute);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
      else clearTimeout(timer.current);
    };

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return state;
}
