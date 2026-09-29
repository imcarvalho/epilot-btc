import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClock, toServerTime } from '@/lib/server-clock';
import { useServerNow } from './useGame';

const SERVER_START = Date.UTC(2026, 8, 29, 12, 0, 0);

describe('createServerClock', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(SERVER_START);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('advances one second per second when the offset changes every second', () => {
		const clock = createServerClock({
			localNow: () => Date.now(),
		});
		const seen: number[] = [];
		clock.subscribe(() => seen.push(clock.getNow()));
		// A stream state lands just before each tick, with a jittering offset.
		for (let i = 1; i <= 5; i += 1) {
			vi.advanceTimersByTime(900);
			clock.setOffset(50 + (i % 2) * 7);
			vi.advanceTimersByTime(100);
		}
		expect(seen).toHaveLength(5);
		seen.forEach((value, i) => {
			const offset = 50 + ((i + 1) % 2) * 7;
			expect(value).toBe(SERVER_START + (i + 1) * 1_000 + offset);
		});
	});

	it('reads server time at once when the offset changes', () => {
		const clock = createServerClock({
			localNow: () => Date.now(),
		});
		clock.setOffset(-3_000);
		expect(clock.getNow()).toBe(SERVER_START - 3_000);
	});

	it('runs one interval while subscribed and none after', () => {
		const clock = createServerClock({
			localNow: () => Date.now(),
		});
		const off1 = clock.subscribe(() => {});
		const off2 = clock.subscribe(() => {});
		expect(vi.getTimerCount()).toBe(1);
		off1();
		expect(vi.getTimerCount()).toBe(1);
		off2();
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('useServerNow', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function Probe({ offset }: { offset: number }) {
		return createElement('span', null, String(useServerNow(offset)));
	}

	it.each([
		['ahead', 90_000],
		['behind', -90_000],
	])(
		'the first render with a browser clock %s is already on server time',
		(_name, skew) => {
			// The browser's clock is `skew` away from the server's.
			vi.setSystemTime(SERVER_START + skew);
			const html = renderToString(
				createElement(Probe, {
					offset: -skew,
				}),
			);
			expect(html).toContain(String(SERVER_START));
		},
	);
});

describe('toServerTime', () => {
	it('is local time plus the offset, so the chart window ends on server time', () => {
		const skewedLocal = SERVER_START + 120_000;
		expect(toServerTime(skewedLocal, -120_000)).toBe(SERVER_START);
	});
});
