import { rateWords, scoreWords, signedWords } from './spoken';

describe('signedWords', () => {
	it('says the sign in words, so a minus sign is never skipped', () => {
		expect(signedWords(1)).toBe('plus 1');
		expect(signedWords(-1)).toBe('minus 1');
		expect(signedWords(0)).toBe('0');
	});
});

describe('scoreWords', () => {
	it('gives a score its unit, singular for one', () => {
		expect(scoreWords(42)).toBe('42 points');
		expect(scoreWords(1)).toBe('1 point');
		expect(scoreWords(0)).toBe('0 points');
		expect(scoreWords(-1)).toBe('minus 1 point');
		expect(scoreWords(-2)).toBe('minus 2 points');
	});
});

describe('rateWords', () => {
	it('says what the rate is out of', () => {
		expect(rateWords(56, 75)).toBe('56% correct over 75 guesses');
		expect(rateWords(100, 1)).toBe('100% correct over 1 guess');
	});

	it('says there is nothing yet where the screen shows a dash', () => {
		expect(rateWords(null, 0)).toBe('no results yet');
	});
});
