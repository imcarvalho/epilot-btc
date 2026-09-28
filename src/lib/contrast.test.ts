import {
	composite,
	contrastRatio,
	parseColor,
	relativeLuminance,
} from './contrast';

describe('parseColor', () => {
	it('reads hex in its three lengths, and rgb()/rgba()', () => {
		expect(parseColor('#fff')).toEqual({
			r: 255,
			g: 255,
			b: 255,
			a: 1,
		});
		expect(parseColor('#21222C')).toEqual({
			r: 33,
			g: 34,
			b: 44,
			a: 1,
		});
		expect(parseColor('#FF8A8A26').a).toBeCloseTo(0.149, 3);
		expect(parseColor('rgba(125, 251, 170, 0.12)')).toEqual({
			r: 125,
			g: 251,
			b: 170,
			a: 0.12,
		});
		expect(parseColor('rgb(0, 0, 0)').a).toBe(1);
	});

	it('refuses what it cannot read, rather than guessing', () => {
		expect(() => parseColor('var(--color-border)')).toThrow();
	});
});

describe('contrastRatio', () => {
	it('matches the WCAG endpoints', () => {
		expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
		expect(contrastRatio('#777777', '#777777')).toBe(1);
	});

	it('is symmetric', () => {
		expect(contrastRatio('#BD93F9', '#21222C')).toBeCloseTo(
			contrastRatio('#21222C', '#BD93F9'),
			10,
		);
	});

	it('matches known reference values', () => {
		// WebAIM's checker: #767676 on white is the classic 4.54:1.
		expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
		expect(relativeLuminance(parseColor('#FFFFFF'))).toBe(1);
	});

	it('composites a translucent background over what is behind it', () => {
		const washOverCard = composite(
			parseColor('rgba(255, 255, 255, 0.5)'),
			parseColor('#000000'),
		);
		expect(washOverCard.r).toBeCloseTo(127.5, 5);
		expect(
			contrastRatio('#FFFFFF', ['rgba(255, 255, 255, 0.5)', '#000000']),
		).toBeLessThan(contrastRatio('#FFFFFF', '#000000'));
	});

	it('refuses a background with nothing opaque under it', () => {
		expect(() => contrastRatio('#FFFFFF', 'rgba(0, 0, 0, 0.5)')).toThrow(
			/translucent/,
		);
	});
});
