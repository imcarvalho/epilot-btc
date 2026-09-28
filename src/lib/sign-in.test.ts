import { signInSentence } from './sign-in';

describe('signInSentence', () => {
	it('says the score now travels, when it was carried over or started fresh', () => {
		expect(signInSentence('promoted')).toBe(
			'Signed in. Your score now follows you to any device.',
		);
		expect(signInSentence('created')).toBe(signInSentence('promoted'));
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
