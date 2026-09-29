/**
 * Engineering spec §3: one tape read per process. Many waiting streams cost
 * one Coinbase read, a failure is not retried at once, and a reader is only
 * served a read that could show the price at its own deadline.
 */

import {
	createSharedTape,
	TAPE_CACHE_MS,
	TAPE_FAILURE_MS,
	TapeBackoffError,
} from './shared-tape';
import type { PricePoint } from './settlement';

const T0 = 1_700_000_000_000;

function setup() {
	let clock = T0;
	const gates: Array<{
		from: number;
		resolve: (tape: PricePoint[]) => void;
		reject: (error: Error) => void;
	}> = [];
	const fetchTape = vi.fn(
		(from: number) =>
			new Promise<PricePoint[]>((resolve, reject) => {
				gates.push({
					from,
					resolve,
					reject,
				});
			}),
	);
	const read = createSharedTape({
		fetchTape,
		now: () => clock,
	});
	return {
		read,
		fetchTape,
		gates,
		advance: (ms: number) => (clock += ms),
	};
}

const tapeAt = (price: number): PricePoint[] => [
	{
		time: T0,
		price,
	},
];

describe('createSharedTape', () => {
	it('serves many concurrent readers from one fetch', async () => {
		const { read, fetchTape, gates } = setup();
		const readers = Array.from(
			{
				length: 20,
			},
			() => read(T0 - 60_000),
		);
		expect(fetchTape).toHaveBeenCalledTimes(1);
		gates[0].resolve(tapeAt(1));
		const tapes = await Promise.all(readers);
		for (const tape of tapes) {
			expect(tape).toEqual(tapeAt(1));
		}
		expect(fetchTape).toHaveBeenCalledTimes(1);
	});

	it('serves the next second from the cache, then reads again', async () => {
		const { read, fetchTape, gates, advance } = setup();
		const first = read(T0 - 60_000);
		gates[0].resolve(tapeAt(1));
		await first;

		advance(TAPE_CACHE_MS - 1);
		await expect(read(T0 - 60_000)).resolves.toEqual(tapeAt(1));
		expect(fetchTape).toHaveBeenCalledTimes(1);

		advance(1);
		const later = read(T0 - 60_000);
		expect(fetchTape).toHaveBeenCalledTimes(2);
		gates[1].resolve(tapeAt(2));
		await expect(later).resolves.toEqual(tapeAt(2));
	});

	it('shares one failure, then backs off without calling Coinbase', async () => {
		const { read, fetchTape, gates, advance } = setup();
		const readers = [read(T0 - 60_000), read(T0 - 60_000)];
		gates[0].reject(new Error('429'));
		for (const reader of readers) {
			await expect(reader).rejects.toThrow('429');
		}

		advance(TAPE_FAILURE_MS - 1);
		await expect(read(T0 - 60_000)).rejects.toBeInstanceOf(TapeBackoffError);
		await expect(read(T0 - 60_000)).rejects.toBeInstanceOf(TapeBackoffError);
		expect(fetchTape).toHaveBeenCalledTimes(1);

		advance(1);
		const retry = read(T0 - 60_000);
		expect(fetchTape).toHaveBeenCalledTimes(2);
		gates[1].resolve(tapeAt(3));
		await expect(retry).resolves.toEqual(tapeAt(3));
	});

	it('forgets the back-off once a read succeeds', async () => {
		const { read, gates, advance } = setup();
		const failing = read(T0 - 60_000);
		gates[0].reject(new Error('down'));
		await failing.catch(() => {});
		advance(TAPE_FAILURE_MS);
		const ok = read(T0 - 60_000);
		gates[1].resolve(tapeAt(1));
		await ok;
		advance(TAPE_CACHE_MS);
		const again = read(T0 - 60_000);
		gates[2].resolve(tapeAt(2));
		await expect(again).resolves.toEqual(tapeAt(2));
	});

	it('does not serve a reader whose deadline came after the read began', async () => {
		const { read, fetchTape, gates, advance } = setup();
		const early = read(T0 - 60_000);
		gates[0].resolve(tapeAt(1));
		await early;

		// Fetched before this reader's deadline: it cannot show the price
		// standing at it, so it must not be used.
		advance(500);
		const late = read(T0 + 200);
		expect(fetchTape).toHaveBeenCalledTimes(2);
		gates[1].resolve(tapeAt(2));
		await expect(late).resolves.toEqual(tapeAt(2));
	});

	it('reads back to the oldest need when readers differ, and serves newer ones from it', async () => {
		const { read, fetchTape, gates } = setup();
		const newer = read(T0 - 10_000);
		const older = read(T0 - 50_000);
		// The older reader is not covered by the read running: it waits, then reads back further.
		expect(fetchTape).toHaveBeenCalledTimes(1);
		gates[0].resolve(tapeAt(1));
		await newer;
		await vi.waitFor(() => {
			expect(fetchTape).toHaveBeenCalledTimes(2);
		});
		expect(fetchTape).toHaveBeenLastCalledWith(T0 - 50_000);
		gates[1].resolve(tapeAt(2));
		await expect(older).resolves.toEqual(tapeAt(2));

		// A reader who needs less back is served by that deeper read.
		await expect(read(T0 - 10_000)).resolves.toEqual(tapeAt(2));
		expect(fetchTape).toHaveBeenCalledTimes(2);
	});
});
