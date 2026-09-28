import { niceTicks } from './axis';

describe('niceTicks', () => {
	it('lands on round prices for an hour of BTC', () => {
		expect(niceTicks(84_503.25, 84_637.9)).toEqual({
			values: [84_525, 84_550, 84_575, 84_600, 84_625],
			step: 25,
		});
	});

	it('picks the step from 1, 2, 2.5 and 5 times a power of ten', () => {
		expect(niceTicks(0, 100).step).toBe(25);
		expect(niceTicks(0, 7).step).toBe(2);
		expect(niceTicks(0, 3).step).toBe(1);
		expect(niceTicks(0, 1_800).step).toBe(500);
	});

	it('goes below a dollar for a quiet minute', () => {
		expect(niceTicks(84_530.25, 84_532.25)).toEqual({
			values: [84_530.5, 84_531, 84_531.5, 84_532],
			step: 0.5,
		});
	});

	it('keeps every tick inside the range', () => {
		const lo = 84_503.25;
		const hi = 84_637.9;
		for (const v of niceTicks(lo, hi).values) {
			expect(v).toBeGreaterThanOrEqual(lo);
			expect(v).toBeLessThanOrEqual(hi);
		}
	});

	it('includes the ends when they are round themselves', () => {
		expect(niceTicks(84_500, 84_600).values).toEqual([
			84_500, 84_525, 84_550, 84_575, 84_600,
		]);
	});

	it('gives a readable number of ticks across very different ranges', () => {
		for (const [lo, hi] of [
			[0, 1],
			[84_000, 84_000.4],
			[60_000, 61_234],
			[1, 99_999],
		]) {
			const n = niceTicks(lo, hi).values.length;
			expect(n).toBeGreaterThanOrEqual(2);
			expect(n).toBeLessThanOrEqual(8);
		}
	});

	it('has no floating-point dust in its values', () => {
		for (const v of niceTicks(0.1, 0.7).values) {
			expect(String(v)).toMatch(/^\d+(\.\d{1,2})?$/);
		}
	});

	it('gives a flat range its one value', () => {
		expect(niceTicks(84_531, 84_531)).toEqual({
			values: [84_531],
			step: 0,
		});
	});
});
