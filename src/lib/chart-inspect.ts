/**
 * Reading a chart one tick at a time: a minute on the hour chart, a second
 * on the minute chart. The same inspector answers the pointer (the tick
 * nearest the cursor) and the keyboard (arrows step, Home and End jump), so
 * nothing the mouse can read is out of reach without one.
 *
 * Pure: the charts pass in their ticks' x positions and get an index back.
 */

/** Page Up / Page Down move this many ticks: ten minutes, or ten seconds. */
export const PAGE_STEP = 10;

/** The tick nearest `x`, from x positions in ascending order; null if there are none. */
export function nearestIndex(xs: number[], x: number): number | null {
	if (xs.length === 0) return null;
	let lo = 0;
	let hi = xs.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (xs[mid] < x) lo = mid + 1;
		else hi = mid;
	}
	// `lo` is the first tick at or right of x; the one before may be nearer.
	return lo > 0 && x - xs[lo - 1] <= xs[lo] - x ? lo - 1 : lo;
}

/**
 * Where a key press moves the inspector, as a slider would (WAI-ARIA APG):
 * Left/Down step back, Right/Up forward, Page keys by ten, Home and End to
 * the ends, Escape puts it away. Starting from nothing, a step lands on the
 * latest tick. Returns undefined for a key it does not handle, so the
 * caller leaves that key's default alone.
 */
export function stepIndex(
	index: number | null,
	key: string,
	count: number,
): number | null | undefined {
	if (count === 0) return undefined;
	const last = count - 1;
	const clamp = (i: number) => Math.min(last, Math.max(0, i));
	const from = index === null ? null : clamp(index);
	switch (key) {
		case 'Escape':
			return index === null ? undefined : null;
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
