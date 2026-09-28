/**
 * Reading a chart one tick at a time: a minute on the hour chart, a second
 * on the minute chart. The same inspector answers the pointer (the tick
 * nearest the cursor) and the keyboard (arrows step, Home and End jump), so
 * nothing the mouse can read is out of reach without one.
 *
 * What is inspected is held by the tick's time, not its place in the array:
 * the hour refreshes every ten seconds and its candles shift along, and the
 * minute grows a point every second, but a held tick stays the same tick.
 * Escape hides the tooltip and keeps the tick, so a focused inspector never
 * changes what it says unless the player moves it.
 *
 * Pure: the charts pass in their ticks' x positions and times and get an
 * index or an inspection back.
 */

/** Page Up / Page Down move this many ticks: ten minutes, or ten seconds. */
export const PAGE_STEP = 10;

/** The tick nearest `x`, from x positions in ascending order; null if there are none. */
export function nearestIndex(xs: number[], x: number): number | null {
	if (xs.length === 0) {
		return null;
	}
	let lo = 0;
	let hi = xs.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (xs[mid] < x) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	// `lo` is the first tick at or right of x; the one before may be nearer.
	return lo > 0 && x - xs[lo - 1] <= xs[lo] - x ? lo - 1 : lo;
}

/**
 * Where a key press moves the inspector, as a slider would (WAI-ARIA APG):
 * Left/Down step back, Right/Up forward, Page keys by ten, Home and End to
 * the ends. Starting from nothing, a step lands on the latest tick. Returns
 * undefined for a key it does not handle, so the caller leaves that key's
 * default alone.
 */
export function stepIndex(
	index: number | null,
	key: string,
	count: number,
): number | undefined {
	if (count === 0) {
		return undefined;
	}
	const last = count - 1;
	const clamp = (i: number) => Math.min(last, Math.max(0, i));
	const from = index === null ? null : clamp(index);
	switch (key) {
		case 'Home':
			return 0;
		case 'End':
			return last;
		case 'ArrowLeft':
		case 'ArrowDown':
			return from === null ? last : clamp(from - 1);
		case 'ArrowRight':
		case 'ArrowUp':
			return from === null ? last : clamp(from + 1);
		case 'PageDown':
			return from === null ? last : clamp(from - PAGE_STEP);
		case 'PageUp':
			return from === null ? last : clamp(from + PAGE_STEP);
		default:
			return undefined;
	}
}

/** The tick being read, by its time, and whether its tooltip is showing. */
export interface Inspection {
	time: number;
	shown: boolean;
}

/**
 * Where a held time is now, from tick times in ascending order: its own
 * tick, or the nearest one if it has gone (a candle scrolled out of the
 * hour lands on the oldest there is). Null with no ticks, or nothing held.
 */
export function indexAtTime(
	times: number[],
	time: number | null,
): number | null {
	return time === null ? null : nearestIndex(times, time);
}

/** The tick whose crosshair and tooltip are drawn, if any. */
export function shownIndex(
	times: number[],
	inspection: Inspection | null,
): number | null {
	return inspection?.shown ? indexAtTime(times, inspection.time) : null;
}

/**
 * On focus the inspector holds the latest tick as it is at that moment,
 * rather than following the end of a chart that keeps growing. What was
 * already held (by the pointer, say) is kept.
 */
export function focusInspection(
	inspection: Inspection | null,
	times: number[],
): Inspection | null {
	if (inspection) {
		return {
			...inspection,
			shown: true,
		};
	}
	if (times.length === 0) {
		return null;
	}
	return {
		time: times[times.length - 1],
		shown: true,
	};
}

/** The tick nearest the pointer, held and shown. */
export function pointInspection(
	xs: number[],
	times: number[],
	x: number,
): Inspection | null {
	const index = nearestIndex(xs, x);
	return index === null
		? null
		: {
				time: times[index],
				shown: true,
			};
}

/**
 * A key press on the inspector. The slider keys step from the held tick,
 * wherever the data has moved it, and show the tooltip. Escape hides the
 * tooltip but keeps the tick held, so the reading stays put; with nothing
 * showing, Escape is left alone. Undefined for a key it does not handle.
 */
export function inspectKey(
	inspection: Inspection | null,
	key: string,
	times: number[],
): Inspection | undefined {
	if (key === 'Escape') {
		return inspection?.shown
			? {
					...inspection,
					shown: false,
				}
			: undefined;
	}
	const index = indexAtTime(times, inspection?.time ?? null);
	const next = stepIndex(index, key, times.length);
	if (next === undefined) {
		return undefined;
	}
	return {
		time: times[next],
		shown: true,
	};
}
