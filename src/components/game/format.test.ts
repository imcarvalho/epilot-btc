import { formatAge, formatCountdown, formatElapsed, formatUsd } from './format';

describe('formatUsd', () => {
	it('always shows two decimals, whatever Coinbase sent', () => {
		expect(formatUsd(84650.025)).toBe('$84,650.03');
		expect(formatUsd(111144.8)).toBe('$111,144.80');
	});
});

describe('formatAge', () => {
	it('counts seconds, then minutes, then hours', () => {
		expect(formatAge(1_000)).toBe('1s ago');
		expect(formatAge(59_400)).toBe('59s ago');
		expect(formatAge(60_000)).toBe('1 min ago');
		expect(formatAge(2 * 3_600_000)).toBe('2 h ago');
	});

	it('never shows a negative age from a small clock difference', () => {
		expect(formatAge(-800)).toBe('0s ago');
	});
});

describe('formatCountdown', () => {
	it('shows minutes and zero-padded seconds, never below zero', () => {
		expect(formatCountdown(60)).toBe('1:00');
		expect(formatCountdown(47)).toBe('0:47');
		expect(formatCountdown(5)).toBe('0:05');
		expect(formatCountdown(-3)).toBe('0:00');
	});
});

describe('formatElapsed', () => {
	it('reads as seconds under a minute, then minutes and padded seconds', () => {
		expect(formatElapsed(58_000)).toBe('58s');
		expect(formatElapsed(64_000)).toBe('1m 04s');
		expect(formatElapsed(72_400)).toBe('1m 12s');
	});
});
