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
			{
				time: T * 1000,
				low: 99,
				high: 102,
				open: 100,
				close: 101,
			},
			{
				time: (T + 60) * 1000,
				low: 98,
				high: 101,
				open: 101,
				close: 100,
			},
			{
				time: (T + 120) * 1000,
				low: 99,
				high: 104,
				open: 100,
				close: 103,
			},
		]);
	});

	it('rejects anything that is not a list of six-number rows', () => {
		expect(() =>
			parseCandles({
				message: 'rate limited',
			}),
		).toThrow();
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
	const size = {
		width: 600,
		height: 200,
		windowEnd: (T + 60 * 60) * 1000,
	};

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

	it('insets falling bodies for their outline and keeps every wick outside the body', () => {
		const chart = buildCandleChart(
			[candle(0, 100, 110, 90, 120), candle(1, 110, 100, 90, 120)],
			size,
		);
		const [up, down] = chart.candles;
		const coords = (path: string) => path.match(/-?[\d.]+/g)!.map(Number);
		// M x y h w v h h -w: the hollow one starts half a stroke in, both ways.
		const [upX, upY] = coords(chart.upBodies);
		const [downX, downY, downW] = coords(chart.downBodies);
		expect(downY).toBeCloseTo(down.bodyY + 0.5, 1);
		expect(upY).toBeCloseTo(up.bodyY, 1);
		expect(downX - (down.x - up.x)).toBeCloseTo(upX + 0.5, 1);
		expect(downW).toBeCloseTo(coords(chart.upBodies)[2] - 1, 1);
		// Two segments per candle, meeting the body at its edges, never crossing it.
		for (const [path, c] of [
			[chart.upWicks, up],
			[chart.downWicks, down],
		] as const) {
			const ys = coords(path).filter((_, i) => i % 3 !== 0);
			expect(ys).toHaveLength(4);
			expect(ys[0]).toBeCloseTo(c.highY, 1);
			expect(ys[1]).toBeCloseTo(c.bodyY, 1);
			expect(ys[2]).toBeCloseTo(c.bodyY + c.bodyHeight, 1);
			expect(ys[3]).toBeCloseTo(c.lowY, 1);
		}
	});

	it('draws no wick where the body reaches the high or the low', () => {
		const chart = buildCandleChart([candle(0, 100, 110, 100, 110)], size);
		expect(chart.upWicks).toBe('');
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

	it('labels the price axis at round prices, each where that price is drawn', () => {
		const chart = buildCandleChart([candle(0, 100, 110, 90, 120)], size);
		expect(chart.yTicks.map((t) => t.value)).toEqual([90, 100, 110, 120]);
		expect(chart.yStep).toBe(10);
		for (const t of chart.yTicks) {
			expect(t.y).toBeCloseTo(chart.yFor(t.value));
			expect(t.y).toBeGreaterThanOrEqual(0);
			expect(t.y).toBeLessThanOrEqual(size.height);
		}
	});

	it('draws nothing, without failing, for an empty hour', () => {
		const chart = buildCandleChart([], size);
		expect(chart.upBodies).toBe('');
		expect(chart.lastCloseY).toBeNull();
		expect(chart.yTicks).toEqual([]);
	});
});
