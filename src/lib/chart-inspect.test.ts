import {
	PAGE_STEP,
	focusInspection,
	indexAtTime,
	inspectKey,
	nearestIndex,
	pointInspection,
	shownIndex,
	stepIndex,
} from './chart-inspect';

describe('nearestIndex', () => {
	const xs = [5, 15, 25, 35];

	it('picks the tick nearest the pointer', () => {
		expect(nearestIndex(xs, 14)).toBe(1);
		expect(nearestIndex(xs, 21)).toBe(2);
	});

	it('picks the earlier tick when exactly between two', () => {
		expect(nearestIndex(xs, 20)).toBe(1);
	});

	it('clamps to the ends outside the ticks', () => {
		expect(nearestIndex(xs, -40)).toBe(0);
		expect(nearestIndex(xs, 900)).toBe(3);
	});

	it('handles one tick, and none', () => {
		expect(nearestIndex([12], 300)).toBe(0);
		expect(nearestIndex([], 3)).toBeNull();
	});
});

describe('stepIndex', () => {
	it('steps one tick with the arrows, as a slider does', () => {
		expect(stepIndex(4, 'ArrowLeft', 10)).toBe(3);
		expect(stepIndex(4, 'ArrowDown', 10)).toBe(3);
		expect(stepIndex(4, 'ArrowRight', 10)).toBe(5);
		expect(stepIndex(4, 'ArrowUp', 10)).toBe(5);
	});

	it('stops at the ends rather than wrapping', () => {
		expect(stepIndex(0, 'ArrowLeft', 10)).toBe(0);
		expect(stepIndex(9, 'ArrowRight', 10)).toBe(9);
	});

	it('jumps with Home, End and the page keys', () => {
		expect(stepIndex(4, 'Home', 60)).toBe(0);
		expect(stepIndex(4, 'End', 60)).toBe(59);
		expect(stepIndex(30, 'PageDown', 60)).toBe(30 - PAGE_STEP);
		expect(stepIndex(55, 'PageUp', 60)).toBe(59);
	});

	it('starts from the latest tick when nothing is selected', () => {
		expect(stepIndex(null, 'ArrowLeft', 60)).toBe(59);
		expect(stepIndex(null, 'ArrowRight', 60)).toBe(59);
		expect(stepIndex(null, 'Home', 60)).toBe(0);
	});

	it('recovers when the data shrank under the selection', () => {
		expect(stepIndex(80, 'ArrowLeft', 60)).toBe(58);
	});

	it('ignores other keys, and a chart with no ticks', () => {
		expect(stepIndex(4, 'Tab', 10)).toBeUndefined();
		expect(stepIndex(4, 'a', 10)).toBeUndefined();
		expect(stepIndex(null, 'ArrowLeft', 0)).toBeUndefined();
	});
});

// Minute candles: the hour as it was, and ten seconds later with the oldest
// scrolled out and a new minute begun.
const MIN = 60_000;
const before = Array.from(
	{
		length: 60,
	},
	(_, i) => (100 + i) * MIN,
);
const after = [...before.slice(1), 160 * MIN];

describe('indexAtTime', () => {
	it('finds the held tick wherever the data has moved it', () => {
		expect(indexAtTime(before, 140 * MIN)).toBe(40);
		expect(indexAtTime(after, 140 * MIN)).toBe(39);
	});

	it('lands on the oldest tick when the held one has scrolled out', () => {
		expect(indexAtTime(after, 100 * MIN)).toBe(0);
	});

	it('holds nothing with no time, or no ticks', () => {
		expect(indexAtTime(before, null)).toBeNull();
		expect(indexAtTime([], 140 * MIN)).toBeNull();
	});
});

describe('shownIndex', () => {
	it('draws the held tick only while its tooltip is showing', () => {
		expect(
			shownIndex(before, {
				time: 140 * MIN,
				shown: true,
			}),
		).toBe(40);
		expect(
			shownIndex(before, {
				time: 140 * MIN,
				shown: false,
			}),
		).toBeNull();
		expect(shownIndex(before, null)).toBeNull();
	});
});

describe('focusInspection', () => {
	it('holds the latest tick at the moment of focus', () => {
		expect(focusInspection(null, before)).toEqual({
			time: 159 * MIN,
			shown: true,
		});
	});

	it('does not follow the end of a chart that grows after focus', () => {
		const held = focusInspection(null, before)!;
		expect(indexAtTime(after, held.time)).toBe(58);
	});

	it('keeps what the pointer already held', () => {
		expect(
			focusInspection(
				{
					time: 120 * MIN,
					shown: false,
				},
				before,
			),
		).toEqual({
			time: 120 * MIN,
			shown: true,
		});
	});

	it('holds nothing on an empty chart', () => {
		expect(focusInspection(null, [])).toBeNull();
	});
});

describe('pointInspection', () => {
	it('holds the tick nearest the pointer, by its time', () => {
		expect(pointInspection([5, 15, 25], [1000, 2000, 3000], 17)).toEqual({
			time: 2000,
			shown: true,
		});
		expect(pointInspection([], [], 17)).toBeNull();
	});
});

describe('inspectKey', () => {
	const held = {
		time: 140 * MIN,
		shown: true,
	};

	it('steps from the held tick, not from where it used to sit', () => {
		expect(inspectKey(held, 'ArrowLeft', after)).toEqual({
			time: 139 * MIN,
			shown: true,
		});
		expect(inspectKey(held, 'ArrowRight', after)).toEqual({
			time: 141 * MIN,
			shown: true,
		});
	});

	it('starts from the latest tick when nothing is held', () => {
		expect(inspectKey(null, 'ArrowLeft', before)).toEqual({
			time: 159 * MIN,
			shown: true,
		});
		expect(inspectKey(null, 'Home', before)).toEqual({
			time: 100 * MIN,
			shown: true,
		});
	});

	it('hides the tooltip with Escape but keeps the tick held', () => {
		expect(inspectKey(held, 'Escape', before)).toEqual({
			time: 140 * MIN,
			shown: false,
		});
	});

	it('leaves Escape alone when nothing is showing', () => {
		expect(
			inspectKey(
				{
					time: 140 * MIN,
					shown: false,
				},
				'Escape',
				before,
			),
		).toBeUndefined();
		expect(inspectKey(null, 'Escape', before)).toBeUndefined();
	});

	it('shows the tooltip again on the next step after Escape', () => {
		const hidden = inspectKey(held, 'Escape', before)!;
		expect(inspectKey(hidden, 'ArrowLeft', before)).toEqual({
			time: 139 * MIN,
			shown: true,
		});
	});

	it('ignores other keys, and a chart with no ticks', () => {
		expect(inspectKey(held, 'Tab', before)).toBeUndefined();
		expect(inspectKey(null, 'ArrowLeft', [])).toBeUndefined();
	});
});
