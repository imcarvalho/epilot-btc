/**
 * What the screen says after a sign-in (product spec §6.3, §7): carrying
 * the score over is said in a sentence, and so is finding an account that
 * already had one - the spec asks for that plainly, never a silent swap.
 */

import type { SignInOutcome } from './contracts';

/** The notice for a sign-in that has just happened, or null when there is nothing to say. */
export function signInSentence(outcome: SignInOutcome): string | null {
	switch (outcome) {
		case 'promoted':
		case 'created':
			return 'Signed in. Your score now follows you to any device.';
		case 'kept-existing':
			return 'Signed in. This is the score saved to your account. The one played on this browser is kept apart, and comes back if you sign out.';
		case 'returning':
			return null;
	}
}
