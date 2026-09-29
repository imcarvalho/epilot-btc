import { signInSentence } from './sign-in';

describe('signInSentence', () => {
	it('says the score now travels, for a fresh account', () => {
		expect(signInSentence('created', 'SolemnOtter')).toMatch(
			/^Signed in\. Your score now follows you to any device\./,
		);
	});

	it('welcomes a first sign-in by name and says why the name is random', () => {
		for (const outcome of ['created', 'promoted'] as const) {
			expect(signInSentence(outcome, 'SolemnOtter')).toMatch(
				/ Welcome, SolemnOtter\. To protect your privacy we gave you a random name\. It is how you appear on the leaderboard, and your Google name is never shown\.$/,
			);
		}
	});

	it('waits for the name rather than say half of the welcome', () => {
		expect(signInSentence('created', null)).toBeNull();
		expect(signInSentence('promoted', null)).toBeNull();
	});

	it('says plainly that the score starts again when an anonymous player was promoted', () => {
		expect(signInSentence('promoted', 'SolemnOtter')).toMatch(
			/^Signed in\. Your score starts again from 0, because the board counts only what you play while signed in, and it now follows you to any device\./,
		);
	});

	it('says plainly when an existing account replaced what was on screen', () => {
		expect(signInSentence('kept-existing', 'SolemnOtter')).toMatch(
			/^Signed in\. This is the score saved to your account\./,
		);
	});

	it('does not welcome an account that already existed', () => {
		expect(signInSentence('kept-existing', 'SolemnOtter')).not.toMatch(
			/Welcome/,
		);
	});

	it('says nothing when there was nothing to carry over', () => {
		expect(signInSentence('returning', 'SolemnOtter')).toBeNull();
	});
});
