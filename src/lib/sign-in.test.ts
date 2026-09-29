import { signInSentence } from './sign-in';

describe('signInSentence', () => {
	it('says the score now travels, for a fresh account', () => {
		expect(signInSentence('created')).toBe(
			'Signed in. Your score now follows you to any device.',
		);
	});

	it('says plainly that the score starts again when an anonymous player was promoted', () => {
		expect(signInSentence('promoted')).toBe(
			'Signed in. Your score starts again from 0, because the board counts only what you play while signed in, and it now follows you to any device.',
		);
	});

	it('says plainly when an existing account replaced what was on screen', () => {
		expect(signInSentence('kept-existing')).toMatch(
			/^Signed in\. This is the score saved to your account\./,
		);
	});

	it('says nothing when there was nothing to carry over', () => {
		expect(signInSentence('returning')).toBeNull();
	});
});
