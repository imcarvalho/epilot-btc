import { CONFETTI_COLOURS, confettiPieces } from './confetti';

// A fixed sequence, so the layout is deterministic.
const sequence = (values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length];
};

describe('confettiPieces', () => {
	it('makes the number of pieces asked for', () => {
		expect(confettiPieces(80, Math.random)).toHaveLength(80);
	});

	it('keeps every piece inside its ranges, whatever the randomness', () => {
		for (const random of [
			() => 0,
			() => 0.999_999,
			sequence([0.1, 0.9, 0.5]),
		]) {
			for (const p of confettiPieces(40, random)) {
				expect(p.left).toBeGreaterThanOrEqual(0);
				expect(p.left).toBeLessThanOrEqual(100);
				expect(p.delayMs).toBeGreaterThanOrEqual(0);
				expect(p.delayMs).toBeLessThanOrEqual(400);
				expect(p.durationMs).toBeGreaterThanOrEqual(1_600);
				expect(p.durationMs).toBeLessThanOrEqual(2_600);
				expect(Math.abs(p.driftPx)).toBeLessThanOrEqual(120);
				expect(CONFETTI_COLOURS).toContain(p.colour);
			}
		}
	});

	it('is fully determined by the random source', () => {
		expect(confettiPieces(5, sequence([0.2, 0.4, 0.6]))).toEqual(
			confettiPieces(5, sequence([0.2, 0.4, 0.6])),
		);
	});
});
