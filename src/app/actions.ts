'use server';

import { signIn, signOut } from '@/auth';

/**
 * Sign-in and sign-out as server actions: plain forms that post to the
 * server, so they work before the page has hydrated and carry Auth.js's
 * CSRF protection without the client handling a token.
 */
export async function signInWithGoogle() {
	await signIn('google', { redirectTo: '/' });
}

/** Back to anonymous play (product spec §6.3). Nothing is deleted. */
export async function signOutOfGoogle() {
	await signOut({ redirectTo: '/' });
}
