/**
 * Public identity: a generated AdjectiveAnimal name.
 *
 * Engineering spec §6.3, product spec §6.6. Every player gets one on arrival,
 * signed in or not. It is how they appear to everyone else, which is also what
 * keeps a signed-in player's real Google name off the leaderboard.
 *
 * Curated word lists, so no combination lands somewhere unfortunate.
 * Collisions are allowed rather than retried: `playerId` is the real key, and
 * two SolemnOtters cost nothing while retrying would cost a read.
 *
 * Pure by design - the randomness is injected, so tests need no mocking. The
 * name is stored at player creation and never recomputed.
 */

// Trimmed starter lists. Widen both toward ~200 each before shipping; keep them
// alphabetical, and keep out anything that could read as a slur, a body-shape
// comment or a political term when paired with an animal.
export const ADJECTIVES = [
	'Audacious',
	'Brisk',
	'Candid',
	'Dapper',
	'Eager',
	'Fearless',
	'Gallant',
	'Hearty',
	'Intrepid',
	'Jaunty',
	'Keen',
	'Lively',
	'Merry',
	'Nimble',
	'Patient',
	'Quiet',
	'Radiant',
	'Solemn',
	'Tranquil',
	'Upbeat',
	'Valiant',
	'Whimsical',
	'Zealous',
] as const;

export const ANIMALS = [
	'Badger',
	'Cormorant',
	'Dormouse',
	'Egret',
	'Ferret',
	'Gannet',
	'Heron',
	'Ibex',
	'Jackdaw',
	'Kestrel',
	'Lynx',
	'Marten',
	'Newt',
	'Otter',
	'Puffin',
	'Quokka',
	'Raccoon',
	'Shrike',
	'Tapir',
	'Umbrette',
	'Vole',
	'Wombat',
] as const;

/** Injected so the function stays pure and tests stay deterministic. */
export type RandomSource = () => number;

export function generateName(random: RandomSource = Math.random): string {
	const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
	const animal = ANIMALS[Math.floor(random() * ANIMALS.length)];
	return `${adjective}${animal}`;
}
