import {
	buildMinuteChart,
	parseTicker,
	standing,
	takeSample,
	type Sample,
} from './live-minute';

const T0 = 1_790_520_000_000;

describe('parseTicker', () => {
	it("reads a ticker message's price and time", () => {
		const msg = {
			type: 'ticker',
			product_id: 'BTC-USD',
			price: '84586.97',
			time: '2026-09-27T16:27:14.615918Z',
		};
		expect(parseTicker(JSON.stringify(msg))).toEqual({
			price: 84586.97,
			time: Date.parse('2026-09-27T16:27:14.615Z'),
		});
	});

	it('ignores everything that is not a BTC-USD ticker', () => {
		expect(
			parseTicker(
				JSON.stringify({
					type: 'subscriptions',
					channels: [],
				}),
			),
		).toBeNull();
		expect(
			parseTicker(
				JSON.stringify({
					type: 'ticker',
					product_id: 'ETH-USD',
					price: '3000',
					time: '2026-09-27T16:27:14Z',
				}),
			),
		).toBeNull();
		expect(parseTicker('not json')).toBeNull();
		expect(
			parseTicker(
				JSON.stringify({
					type: 'ticker',
					product_id: 'BTC-USD',
					price: 'abc',
					time: 'x',
				}),
			),
		).toBeNull();
	});
});

describe('takeSample', () => {
	it('appends the latest price once per call - one point per second, however many ticks arrived', () => {
		let samples: Sample[] = [];
		samples = takeSample(samples, 100, T0 + 1_000, T0);
		samples = takeSample(samples, 101, T0 + 2_000, T0);
		expect(samples).toEqual([
			{
				t: T0 + 1_000,
				price: 100,
			},
			{
				t: T0 + 2_000,
				price: 101,
			},
		]);
	});

	it('takes nothing before the first tick has arrived', () => {
		expect(takeSample([], null, T0 + 1_000, T0)).toEqual([]);
	});

	it('drops anything from before the guess started', () => {
		expect(
			takeSample(
				[
					{
						t: T0 - 5_000,
						price: 99,
					},
				],
				100,
				T0 + 1_000,
				T0,
			),
		).toEqual([
			{
				t: T0 + 1_000,
				price: 100,
			},
		]);
	});

	it('keeps a bounded number of points when the minute runs long', () => {
		let samples: Sample[] = [];
		for (let i = 1; i <= 400; i++) {
			samples = takeSample(samples, 100 + i, T0 + i * 1_000, T0);
		}
		expect(samples.length).toBeLessThanOrEqual(300);
		expect(samples[samples.length - 1].price).toBe(500);
	});
});

describe('standing', () => {
	it('is ahead when the price moved the way the guess said', () => {
		expect(standing('up', 100, 110)).toEqual({
			margin: 10,
			ahead: true,
		});
		expect(standing('down', 100, 90)).toEqual({
			margin: 10,
			ahead: true,
		});
	});

	it('is behind when it moved the other way, with a negative margin', () => {
		expect(standing('up', 100, 95)).toEqual({
			margin: -5,
			ahead: false,
		});
		expect(standing('down', 100, 105)).toEqual({
			margin: -5,
			ahead: false,
		});
	});

	it('is neither on an unchanged price', () => {
		expect(standing('up', 100, 100)).toEqual({
			margin: 0,
			ahead: null,
		});
	});
});

describe('buildMinuteChart', () => {
	const size = {
		width: 600,
		height: 200,
		start: T0,
		lockedPrice: 100,
		padding: 10,
	};

	it('spans the minute from the guess, so the axis is the countdown', () => {
		const chart = buildMinuteChart(
			[
				{
					t: T0 + 30_000,
					price: 105,
				},
			],
			{
				...size,
				now: T0 + 30_000,
			},
		);
		// points[0] is the seed at the locked price; the sample follows it.
		expect(chart.points[1].x).toBeCloseTo(300);
		expect(chart.nowX).toBeCloseTo(300);
	});

	it('starts the line at the locked price, at the moment of the guess', () => {
		const chart = buildMinuteChart(
			[
				{
					t: T0 + 1_000,
					price: 105,
				},
			],
			{
				...size,
				now: T0 + 1_000,
			},
		);
		expect(chart.points[0]).toEqual({
			x: 0,
			y: chart.lockedY,
			t: T0,
			price: 100,
		});
		expect(chart.points[1]).toMatchObject({
			t: T0 + 1_000,
			price: 105,
		});
		expect(chart.line.startsWith('M0 ')).toBe(true);
	});

	it('keeps the locked line inside the chart even when every price is above it', () => {
		const chart = buildMinuteChart(
			[
				{
					t: T0 + 1_000,
					price: 150,
				},
				{
					t: T0 + 2_000,
					price: 160,
				},
			],
			{
				...size,
				now: T0 + 2_000,
			},
		);
		expect(chart.lockedY).toBeLessThanOrEqual(size.height);
		expect(chart.lockedY).toBeGreaterThan(chart.yFor(160));
	});

	it('closes the area back to the locked line, so the margin is what is shaded', () => {
		const chart = buildMinuteChart(
			[
				{
					t: T0 + 10_000,
					price: 110,
				},
			],
			{
				...size,
				now: T0 + 10_000,
			},
		);
		expect(chart.area.endsWith('Z')).toBe(true);
		expect(chart.area).toContain(`${chart.lockedY}`);
	});

	it('stretches past a minute when the guess is still waiting for a move', () => {
		const chart = buildMinuteChart(
			[
				{
					t: T0 + 90_000,
					price: 100,
				},
			],
			{
				...size,
				now: T0 + 90_000,
			},
		);
		expect(chart.nowX).toBeCloseTo(size.width);
		expect(chart.windowEnd).toBe(T0 + 90_000);
	});

	it('does not divide by zero on a perfectly flat minute', () => {
		const chart = buildMinuteChart(
			[
				{
					t: T0 + 5_000,
					price: 100,
				},
			],
			{
				...size,
				now: T0 + 5_000,
			},
		);
		for (const p of chart.points) {
			expect(Number.isFinite(p.y)).toBe(true);
		}
	});
});
