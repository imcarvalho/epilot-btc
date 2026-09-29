import { ordinal, placeSentence } from './place';

describe('ordinal', () => {
	it('uses the right suffix, including the teens', () => {
		expect(
			[1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 138].map(ordinal),
		).toEqual([
			'1st',
			'2nd',
			'3rd',
			'4th',
			'11th',
			'12th',
			'13th',
			'21st',
			'22nd',
			'23rd',
			'101st',
			'111th',
			'138th',
		]);
	});
});

describe('placeSentence', () => {
	it('names a podium place', () => {
		expect(placeSentence(1, 40)).toBe('First place. Nice.');
		expect(placeSentence(2, 40)).toBe('Second place. Nice.');
		expect(placeSentence(3, 40)).toBe('Third place. Nice.');
	});

	it('gives position and total outside it (product spec §7)', () => {
		expect(placeSentence(138, 1204)).toBe('138th of 1,204.');
	});
});
