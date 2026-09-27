/**
 * When the browser should ask the server about a pending guess.
 *
 * Engineering spec §3.1. There is no WebSocket from our backend, because the
 * client can work out for itself when an answer is plausible: it owns the
 * countdown, and the Coinbase ticker it already has open for the chart tells it
 * when the price has moved.
 *
 * So this is a policy, expressed as a pure decision over observable facts. The
 * client triggers; the server still decides. A wrong call here costs one extra
 * request that answers "not yet" - never a wrong outcome.
 */

export interface CadenceInput {
  /** Has the 60-second window elapsed, by the server-derived clock? */
  countdownEnded: boolean;
  /** The price the guess was locked at, or null when nothing is pending. */
  lockedPrice: number | null;
  /** Latest price seen on the Coinbase ticker, or null if none yet. */
  lastTickerPrice: number | null;
  /** Is the browser-side ticker socket connected and delivering? */
  socketAlive: boolean;
  /** document.visibilityState !== "hidden" */
  visible: boolean;
  /** Milliseconds since the last GET /api/state, or null if none yet. */
  msSinceLastAsk: number | null;
  /** Has the client already asked once since the countdown ended? */
  askedSinceCountdownEnded: boolean;
}

export type CadenceDecision =
  | { ask: true; reason: "mount" | "countdown-ended" | "price-moved" | "fallback-poll" }
  | { ask: false };

/** Fallback polling only, for when the ticker cannot tell us anything. */
export const FALLBACK_POLL_MS = 5_000;
export const FALLBACK_POLL_BACKOFF_MS = 10_000;

/**
 * The server's price is cached for a few seconds, so the browser's ticker
 * can show a move the server has not read yet, and "the ticker differs from
 * the locked price" stays true after an ask that came back unsettled.
 * Re-asking every second would only hit that cache again; this spaces the
 * retries.
 */
export const PRICE_MOVED_MIN_GAP_MS = 2_000;

export function shouldAsk(input: CadenceInput): CadenceDecision {
  // A hidden tab asks for nothing. It resyncs immediately on becoming visible,
  // which is the `msSinceLastAsk === null` case below.
  if (!input.visible) return { ask: false };

  // First contact, or the first tick after the tab came back.
  if (input.msSinceLastAsk === null) return { ask: true, reason: "mount" };

  // Nothing pending: the score and price already arrived with the last read.
  if (input.lockedPrice === null) return { ask: false };

  // During the minute there is nothing to learn - the countdown is local.
  if (!input.countdownEnded) return { ask: false };

  // The minute is up: ask once. Most of the time this resolves it.
  if (!input.askedSinceCountdownEnded) {
    return { ask: true, reason: "countdown-ended" };
  }

  // Still pending, so the price had not moved. Wait for the ticker to say it
  // has, rather than polling blindly.
  if (input.socketAlive) {
    if (
      input.lastTickerPrice !== null &&
      input.lastTickerPrice !== input.lockedPrice &&
      input.msSinceLastAsk >= PRICE_MOVED_MIN_GAP_MS
    ) {
      return { ask: true, reason: "price-moved" };
    }
    return { ask: false };
  }

  // No ticker to lean on: this is the one case that polls.
  const interval =
    input.msSinceLastAsk >= FALLBACK_POLL_BACKOFF_MS
      ? FALLBACK_POLL_BACKOFF_MS
      : FALLBACK_POLL_MS;

  return input.msSinceLastAsk >= interval
    ? { ask: true, reason: "fallback-poll" }
    : { ask: false };
}
