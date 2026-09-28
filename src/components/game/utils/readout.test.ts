import {
	candleReadout,
	movePhrase,
	sampleReadout,
	standingPhrase,
} from './readout';

describe('movePhrase', () => {
	it('says which way and by how much', () => {
		expect(movePhrase(12.4)).toBe('up $12.40');
		expect(movePhrase(-3.1)).toBe('down $3.10');
		expect(movePhrase(0)).toBe('flat');
	});
});

describe('standingPhrase', () => {
	it('says whether the guess is winning', () => {
		expect(standingPhrase(118.2)).toBe('ahead by $118.20');
		expect(standingPhrase(-4.1)).toBe('behind by $4.10');
		expect(standingPhrase(0)).toBe('level');
	});
});

describe('candleReadout', () => {
	// Local time, so the clock reads 14:32 in whatever zone the tests run.
	const time = new Date(2026, 8, 27, 14, 32).getTime();
	const candle = {
		time,
		open: 65_000,
		high: 65_020.5,
		low: 64_990,
		close: 65_012.4,
	};

	it('titles the minute with its time and move', () => {
		expect(candleReadout(candle).title).toBe('14:32 · up $12.40');
	});

	it('lists open, high, low and close', () => {
		expect(candleReadout(candle).rows).toEqual([
			{
				label: 'Open',
				value: '$65,000.00',
			},
			{
				label: 'High',
				value: '$65,020.50',
			},
			{
				label: 'Low',
				value: '$64,990.00',
			},
			{
				label: 'Close',
				value: '$65,012.40',
			},
		]);
	});

	it('says the same as a sentence, for a screen reader', () => {
		expect(candleReadout(candle).text).toBe(
			'14:32: opened at $65,000.00, closed at $65,012.40, up $12.40. High $65,020.50, low $64,990.00.',
		);
	});
});

describe('sampleReadout', () => {
	const guess = {
		createdAt: 1_000_000,
		direction: 'up' as const,
		priceAtGuess: 65_000,
	};

	it('reads the seed point as the lock', () => {
		expect(
			sampleReadout(
				{
					t: 1_000_000,
					price: 65_000,
				},
				guess,
			),
		).toEqual({
			title: 'At your guess',
			rows: [
				{
					label: 'Locked',
					value: '$65,000.00',
				},
			],
			text: 'At your guess: locked at $65,000.00.',
		});
	});

	it('reads a second by its offset, price and standing', () => {
		const r = sampleReadout(
			{
				t: 1_023_000,
				price: 65_004.1,
			},
			guess,
		);
		expect(r.title).toBe('+23s');
		expect(r.rows).toEqual([
			{
				label: 'Price',
				value: '$65,004.10',
			},
			{
				label: 'Guess',
				value: 'ahead by $4.10',
			},
		]);
		expect(r.text).toBe(
			'23 seconds after your guess: $65,004.10, ahead by $4.10, provisional.',
		);
	});

	it('reads standing from the direction guessed', () => {
		const r = sampleReadout(
			{
				t: 1_001_000,
				price: 65_004.1,
			},
			{
				...guess,
				direction: 'down',
			},
		);
		expect(r.rows[1].value).toBe('behind by $4.10');
		expect(r.text.startsWith('1 second after')).toBe(true);
	});
});
