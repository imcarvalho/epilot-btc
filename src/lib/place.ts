/**
 * How a place on the board is said (product spec §7): "Second place. Nice."
 * and "138th of 1,204.". Pure and free of the store, so the screen can
 * import it without pulling the server's leaderboard reads along.
 */

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export function ordinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	const suffix = teen
		? 'th'
		: ((
				{
					1: 'st',
					2: 'nd',
					3: 'rd',
				} as Record<number, string>
			)[n % 10] ?? 'th');
	return `${n}${suffix}`;
}

const PODIUM_WORDS = ['First', 'Second', 'Third'];

/** Product spec §7: "Second place. Nice." on the podium, "138th of 1,204." off it. */
export function placeSentence(rank: number, total: number): string {
	if (rank <= PODIUM_WORDS.length) {
		return `${PODIUM_WORDS[rank - 1]} place. Nice.`;
	}
	return `${ordinal(rank)} of ${total.toLocaleString('en-US')}.`;
}
