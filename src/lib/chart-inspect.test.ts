import { PAGE_STEP, nearestIndex, stepIndex } from './chart-inspect';

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

	it('puts the inspector away with Escape, and leaves Escape alone when it is away', () => {
		expect(stepIndex(4, 'Escape', 10)).toBeNull();
		expect(stepIndex(null, 'Escape', 10)).toBeUndefined();
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
