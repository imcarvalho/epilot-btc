/**
 * The charts' price axis: where to put a handful of labelled gridlines so
 * they land on round prices ($84,500, $84,550) rather than wherever four
 * evenly spaced lines happen to fall. Pure, so the choice is tested.
 */

export interface YTick {
	value: number;
	/** Pixels from the top of the chart. */
	y: number;
}

export interface NiceTicks {
	values: number[];
	/** The gap between neighbouring ticks; decides how many decimals a label needs. */
	step: number;
}

/** Steps are one of these times a power of ten: 1, 2, 2.5, 5, 10, 20, 25, 50... */
const MULTIPLIERS = [1, 2, 2.5, 5, 10];

/**
 * Round values inside [lo, hi], as close to `target` of them as a round step
 * allows. A range with no height gets its one value.
 */
export function niceTicks(lo: number, hi: number, target = 4): NiceTicks {
	if (!(hi > lo)) {
		return {
			values: [lo],
			step: 0,
		};
	}
	const raw = (hi - lo) / target;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	// Of the round steps near the raw one, the one whose count of ticks comes
	// closest to the target; on a tie, the finer one.
	let best: NiceTicks | null = null;
	for (const step of MULTIPLIERS.map((m) => m * magnitude)) {
		const candidate = ticksAt(lo, hi, step);
		const miss = Math.abs(candidate.values.length - target);
		if (best === null || miss < Math.abs(best.values.length - target)) {
			best = candidate;
		}
	}
	return best!;
}

/** Whole multiples of `step` inside [lo, hi], free of floating-point dust. */
function ticksAt(lo: number, hi: number, step: number): NiceTicks {
	const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
	const first = Math.ceil(lo / step - 1e-9);
	const last = Math.floor(hi / step + 1e-9);
	const values: number[] = [];
	for (let k = first; k <= last; k++) {
		values.push(Number((k * step).toFixed(decimals)));
	}
	return {
		values,
		step,
	};
}
