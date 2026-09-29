/**
 * The in-memory store stands in for DynamoDB in every game test, so what it
 * promises has to match: the sign-in transaction writes the account, deletes
 * the anonymous record and moves the board total together, or none of them.
 */

import { newPlayerRecord } from '../game';
import { MemoryStore } from './memory-store';

const signedIn = (id: string) => ({
	...newPlayerRecord(`google:${id}`, 'PatientHeron', 1_000),
	onBoard: true,
});

describe('the memory store board total', () => {
	it('starts at zero and counts each account that joins once', async () => {
		const store = new MemoryStore();
		await expect(store.getBoardTotal()).resolves.toBe(0);

		await store.createSignedInPlayer(signedIn('a'), null);
		await store.createSignedInPlayer(signedIn('b'), null);
		await expect(store.getBoardTotal()).resolves.toBe(2);
	});

	it('is not moved by a sign-in that is refused because the account exists', async () => {
		const store = new MemoryStore();
		await store.createSignedInPlayer(signedIn('a'), null);

		await expect(store.createSignedInPlayer(signedIn('a'), null)).resolves.toBe(
			false,
		);
		await expect(store.getBoardTotal()).resolves.toBe(1);
	});

	it('is not moved, and the anonymous record survives, when it changed mid-merge', async () => {
		const store = new MemoryStore();
		const anon = newPlayerRecord('anon:1', 'PatientHeron', 1_000);
		await store.createPlayer(anon);
		// A write lands after the merge read the record.
		store.players.get('anon:1')!.updatedAt = 2_000;

		await expect(store.createSignedInPlayer(signedIn('a'), anon)).resolves.toBe(
			false,
		);
		await expect(store.getBoardTotal()).resolves.toBe(0);
		expect(store.players.has('anon:1')).toBe(true);
		expect(store.players.has('google:a')).toBe(false);
	});

	it('is a counter, not a count of the board: it holds what was joined, not what is listed', async () => {
		const store = new MemoryStore();
		await store.createSignedInPlayer(signedIn('a'), null);
		// Someone on the board is removed out of band, as TTL or a manual
		// delete would. DynamoDB's counter does not notice, and neither does this.
		store.players.delete('google:a');

		await expect(store.getBoardTotal()).resolves.toBe(1);
	});
});
