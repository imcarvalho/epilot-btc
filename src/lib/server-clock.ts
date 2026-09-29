/**
 * The server's clock, as the browser can know it (engineering spec §7.2).
 *
 * Each stream state carries the server's `serverNow`; the difference from the
 * local clock is the offset, and server time is local time plus that offset.
 * Every time on screen (the countdown, the phase, the chart's "now") is on
 * this clock, so a browser whose own clock is wrong still agrees with the
 * server about where a guess stands.
 */

/** The server's time, given the local time and the offset last learned. */
export function toServerTime(localNow: number, offset: number): number {
	return localNow + offset;
}

type ServerClockOptions = {
	/** The local clock; injected so tests can skew it. */
	localNow: () => number;
	/** How often subscribers are told the time moved on. */
	tickMs?: number;
};

/**
 * A clock on server time that ticks once a second while anyone is subscribed.
 *
 * The one interval lives as long as the subscription: a new offset changes
 * what the next reading says and never touches the interval, so a stream that
 * sends a state every second cannot starve the tick. Written as an external
 * store so `useServerNow` can read it with `useSyncExternalStore`.
 */
export function createServerClock({
	localNow,
	tickMs = 1_000,
}: ServerClockOptions) {
	let offset = 0;
	let now = toServerTime(localNow(), offset);
	let timer: ReturnType<typeof setInterval> | undefined;
	const listeners = new Set<() => void>();

	return {
		/**
		 * Take a new offset. The reading is corrected at once, and no one is
		 * notified: this is called while the reading component renders, which is
		 * about to read it. Nothing happens when the offset is unchanged.
		 */
		setOffset(next: number) {
			if (next === offset) {
				return;
			}
			offset = next;
			now = toServerTime(localNow(), offset);
		},
		getNow() {
			return now;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			if (timer === undefined) {
				timer = setInterval(() => {
					now = toServerTime(localNow(), offset);
					listeners.forEach((l) => l());
				}, tickMs);
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && timer !== undefined) {
					clearInterval(timer);
					timer = undefined;
				}
			};
		},
	};
}
