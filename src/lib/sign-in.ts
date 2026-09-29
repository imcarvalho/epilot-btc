/**
 * What the screen says after a sign-in (product spec §6.3, §7): the score
 * starting again is said in a sentence, and so is finding an account that
 * already had one - the spec asks for that plainly, never a silent swap. A first
 * sign-in also says why the player has a random name and where it shows.
 */

import type { SignInOutcome } from './contracts';

/** Said after a first sign-in, once the player's generated name is known. */
function welcome(name: string): string {
	return ` Welcome, ${name}. To protect your privacy we gave you a random name. It is how you appear on the leaderboard, and your Google name is never shown.`;
}

/**
 * The notice for a sign-in that has just happened, or null when there is
 * nothing to say. A first sign-in waits for `name` (null until the game state
 * arrives) so the notice is announced once, complete.
 */
export function signInSentence(
	outcome: SignInOutcome,
	name: string | null,
): string | null {
	switch (outcome) {
		case 'promoted':
			return name === null
				? null
				: `Signed in. Your score starts again from 0, because the board counts only what you play while signed in, and it now follows you to any device.${welcome(name)}`;
		case 'created':
			return name === null
				? null
				: `Signed in. Your score now follows you to any device.${welcome(name)}`;
		case 'kept-existing':
			return 'Signed in. This is the score saved to your account. The one played on this browser is kept apart, and comes back if you sign out.';
		case 'returning':
			return null;
	}
}
