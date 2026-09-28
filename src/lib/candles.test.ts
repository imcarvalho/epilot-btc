import {
	buildCandleChart,
	hourChange,
	parseCandles,
	type Candle,
} from './candles';

const T = 1_790_520_600; // a minute boundary, in seconds

// Coinbase's shape: [time, low, high, open, close, volume], newest first.
const RAW = [
	[T + 120, 99, 104, 100, 103, 1.2],
	[T + 60, 98, 101, 101, 100, 0.8],
	[T, 99, 102, 100, 101, 2.1],
];

const candle = (
	minute: number,
	open: number,
	close: number,
	low = Math.min(open, close),
	high = Math.max(open, close),
): Candle => ({
	time: (T + minute * 60) * 1000,
	open,
	close,
	low,
	high,
});

describe('parseCandles', () => {
	it("reads Coinbase's arrays into candles, oldest first, in milliseconds", () => {
		expect(parseCandles(RAW)).toEqual([
			{ time: T * 1000, low: 99, high: 102, open: 100, close: 101 },
			{ time: (T + 60) * 1000, low: 98, high: 101, open: 101, close: 100 },
			{ time: (T + 120) * 1000, low: 99, high: 104, open: 100, close: 103 },
		]);
	});

	it('rejects anything that is not a list of six-number rows', () => {
		expect(() => parseCandles({ message: 'rate limited' })).toThrow();
		expect(() => parseCandles([[T, 1, 2, 3]])).toThrow();
	});
});

describe('hourChange', () => {
	it('is the last close against the first open', () => {
		expect(hourChange([candle(0, 100, 101), candle(1, 101, 104)])).toBe(4);
		expect(hourChange([candle(0, 100, 97)])).toBe(-3);
	});

	it('is null with no candles to measure', () => {
		expect(hourChange([])).toBeNull();
	});
});

describe('buildCandleChart', () => {
	const size = { width: 600, height: 200, windowEnd: (T + 60 * 60) * 1000 };

	it('puts rising and falling candles in separate paths', () => {
		const chart = buildCandleChart(
			[candle(0, 100, 110), candle(1, 110, 105)],
			size,
		);
		expect(chart.upBodies).not.toBe('');
		expect(chart.downBodies).not.toBe('');
		expect(chart.upBodies.match(/M/g)).toHaveLength(1);
		expect(chart.downBodies.match(/M/g)).toHaveLength(1);
	});

	it('maps the hour onto the width by time, so a missing minute leaves a gap', () => {
		const chart = buildCandleChart(
			[candle(0, 100, 110), candle(59, 100, 110)],
			size,
		);
		expect(chart.candles[0].x).toBeLessThan(size.width * 0.02);
		expect(chart.candles[1].x).toBeGreaterThan(size.width * 0.97);
	});

	it('maps the highest high to the top and the lowest low to the bottom, inside the padding', () => {
		const chart = buildCandleChart([candle(0, 100, 110, 90, 120)], size);
		const [c] = chart.candles;
		expect(c.highY).toBeLessThan(c.lowY);
		expect(c.highY).toBeGreaterThanOrEqual(0);
		expect(c.lowY).toBeLessThanOrEqual(size.height);
	});

	it('gives a flat candle a visible body', () => {
		const [c] = buildCandleChart([candle(0, 100, 100, 99, 101)], size).candles;
		expect(c.bodyHeight).toBeGreaterThanOrEqual(1.5);
	});

	it('marks the last close, for the dashed price line', () => {
		const chart = buildCandleChart(
			[candle(0, 100, 110, 90, 120), candle(1, 110, 95, 90, 112)],
			size,
		);
		expect(chart.lastCloseY).toBeCloseTo(chart.yFor(95));
	});

	it('does not divide by zero when every price in the hour is the same', () => {
		const chart = buildCandleChart(
			[candle(0, 100, 100), candle(1, 100, 100)],
			size,
		);
		for (const c of chart.candles) {
			expect(Number.isFinite(c.bodyY)).toBe(true);
		}
	});

	it("stretches the range to include a locked price outside the hour's candles", () => {
		const chart = buildCandleChart([candle(0, 100, 110, 100, 110)], {
			...size,
			includePrice: 130,
		});
		expect(chart.yFor(130)).toBeGreaterThanOrEqual(0);
		expect(chart.yFor(130)).toBeLessThan(chart.yFor(110));
	});

	it('places a moment in the hour on the x-axis', () => {
		const chart = buildCandleChart([candle(0, 100, 110)], size);
		expect(chart.xFor(size.windowEnd - 30 * 60_000)).toBeCloseTo(
			size.width / 2,
		);
	});

	it('draws nothing, without failing, for an empty hour', () => {
		const chart = buildCandleChart([], size);
		expect(chart.upBodies).toBe('');
		expect(chart.lastCloseY).toBeNull();
	});
});
