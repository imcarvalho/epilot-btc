/**
 * Engineering spec §9, first bullet. These are the cases a reviewer will look
 * for first, because they are the fairness argument in executable form.
 *
 * Runner-agnostic: written for `describe`/`it`/`expect`, which Vitest and Jest
 * both provide. Wire up whichever the project ends up using.
 */

import { resolveGuess, type Guess } from './resolve-guess';

const T0 = 1_700_000_000_000;

const guess = (over: Partial<Guess> = {}): Guess => ({
	direction: 'up',
	priceAtGuess: 100_000,
	createdAt: T0,
	...over,
});

describe('resolveGuess', () => {
	it('resolves an up guess as correct when the price rose', () => {
		expect(resolveGuess(guess(), 100_001, T0 + 60_000)).toEqual({
			resolved: true,
			delta: 1,
		});
	});

	it('resolves an up guess as wrong when the price fell', () => {
		expect(resolveGuess(guess(), 99_999, T0 + 60_000)).toEqual({
			resolved: true,
			delta: -1,
		});
	});

	it('resolves a down guess as correct when the price fell', () => {
		expect(
			resolveGuess(
				guess({
					direction: 'down',
				}),
				99_999,
				T0 + 60_000,
			),
		).toEqual({
			resolved: true,
			delta: 1,
		});
	});

	it('resolves a down guess as wrong when the price rose', () => {
		expect(
			resolveGuess(
				guess({
					direction: 'down',
				}),
				100_001,
				T0 + 60_000,
			),
		).toEqual({
			resolved: true,
			delta: -1,
		});
	});

	it('does not resolve while the price is unchanged, however long it has been', () => {
		expect(resolveGuess(guess(), 100_000, T0 + 60_000)).toEqual({
			resolved: false,
		});
		expect(resolveGuess(guess(), 100_000, T0 + 3_600_000)).toEqual({
			resolved: false,
		});
	});

	it('does not resolve before the minute is up, however far the price moved', () => {
		expect(resolveGuess(guess(), 200_000, T0 + 59_999)).toEqual({
			resolved: false,
		});
	});

	it("resolves at exactly 60 seconds - the rule is 'at least'", () => {
		expect(resolveGuess(guess(), 100_001, T0 + 60_000)).toEqual({
			resolved: true,
			delta: 1,
		});
	});

	it('is pure: the same inputs always give the same answer', () => {
		const g = guess();
		const first = resolveGuess(g, 100_050, T0 + 61_000);
		const second = resolveGuess(g, 100_050, T0 + 61_000);
		expect(first).toEqual(second);
	});
});
