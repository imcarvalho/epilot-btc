/**
 * Engineering spec §3.1: a stream ticket opens one stream, and a player has a
 * small number of live streams, each held by a lease that is renewed while it
 * runs and lapses if the stream dies.
 */

import { createStreamToken } from '@/lib/stream-token';
import { MemoryStore } from '@/lib/testing/memory-store';
import {
	admitStream,
	MAX_STREAMS_PER_PLAYER,
	renewWhileSleeping,
	STREAM_LEASE_MS,
	STREAM_LEASE_RENEW_MS,
} from './admission';

const SECRET = 'test-secret';
const T0 = 1_790_000_000_000;

function setup() {
	const store = new MemoryStore();
	let at = T0;
	const deps = {
		store,
		now: () => at,
	};
	return {
		store,
		deps,
		advance: (ms: number) => {
			at += ms;
		},
		ticket: (playerId = 'anon:abc') => createStreamToken(playerId, SECRET, at),
	};
}

describe('admitStream', () => {
	it('admits a valid ticket', async () => {
		const { deps, ticket } = setup();
		const admission = await admitStream(deps, ticket(), SECRET);
		expect(admission.kind).toBe('admitted');
		if (admission.kind === 'admitted') {
			expect(admission.playerId).toBe('anon:abc');
		}
	});

	it('refuses a forged or expired ticket without spending anything', async () => {
		const { deps, store, advance, ticket } = setup();
		const token = ticket();
		expect(await admitStream(deps, token, 'other-secret')).toEqual({
			kind: 'refused',
			reason: 'invalid-ticket',
		});
		advance(60_000);
		expect(await admitStream(deps, token, SECRET)).toEqual({
			kind: 'refused',
			reason: 'invalid-ticket',
		});
		expect(store.spentTickets.size).toBe(0);
		expect(store.streamLeases.size).toBe(0);
	});

	it('refuses a ticket used a second time', async () => {
		const { deps, ticket } = setup();
		const token = ticket();
		expect((await admitStream(deps, token, SECRET)).kind).toBe('admitted');
		expect(await admitStream(deps, token, SECRET)).toEqual({
			kind: 'refused',
			reason: 'ticket-spent',
		});
	});

	it('admits exactly one of many concurrent uses of the same ticket', async () => {
		const { deps, ticket } = setup();
		const token = ticket();
		const results = await Promise.all(
			Array.from(
				{
					length: 20,
				},
				() => admitStream(deps, token, SECRET),
			),
		);
		expect(results.filter((r) => r.kind === 'admitted')).toHaveLength(1);
	});

	it('allows a few streams per player, then refuses the next', async () => {
		const { deps, ticket } = setup();
		for (let i = 0; i < MAX_STREAMS_PER_PLAYER; i++) {
			expect((await admitStream(deps, ticket(), SECRET)).kind).toBe('admitted');
		}
		expect(await admitStream(deps, ticket(), SECRET)).toEqual({
			kind: 'refused',
			reason: 'too-many-streams',
		});
	});

	it('never lets concurrent tickets exceed the per-player limit', async () => {
		const { deps, ticket } = setup();
		const results = await Promise.all(
			Array.from(
				{
					length: 20,
				},
				() => admitStream(deps, ticket(), SECRET),
			),
		);
		expect(results.filter((r) => r.kind === 'admitted')).toHaveLength(
			MAX_STREAMS_PER_PLAYER,
		);
	});

	it('counts each player separately', async () => {
		const { deps, ticket } = setup();
		for (let i = 0; i < MAX_STREAMS_PER_PLAYER; i++) {
			await admitStream(deps, ticket('anon:a'), SECRET);
		}
		expect((await admitStream(deps, ticket('anon:b'), SECRET)).kind).toBe(
			'admitted',
		);
	});

	it('frees a slot when its stream releases it', async () => {
		const { deps, ticket } = setup();
		const held = [];
		for (let i = 0; i < MAX_STREAMS_PER_PLAYER; i++) {
			held.push(await admitStream(deps, ticket(), SECRET));
		}
		const [first] = held;
		if (first.kind !== 'admitted') {
			throw new Error('expected admitted');
		}
		await first.lease.release();
		expect((await admitStream(deps, ticket(), SECRET)).kind).toBe('admitted');
	});

	it('frees a slot whose stream stopped renewing, once its lease lapses', async () => {
		const { deps, advance, ticket } = setup();
		for (let i = 0; i < MAX_STREAMS_PER_PLAYER; i++) {
			await admitStream(deps, ticket(), SECRET);
		}
		advance(STREAM_LEASE_MS - 1);
		expect((await admitStream(deps, ticket(), SECRET)).kind).toBe('refused');
		advance(2);
		expect((await admitStream(deps, ticket(), SECRET)).kind).toBe('admitted');
	});
});

describe('the lease', () => {
	async function admitted() {
		const s = setup();
		const admission = await admitStream(s.deps, s.ticket(), SECRET);
		if (admission.kind !== 'admitted') {
			throw new Error('expected admitted');
		}
		return {
			...s,
			lease: admission.lease,
		};
	}

	it('is renewed only every ten seconds, not on every tick', async () => {
		const { store, lease, advance } = await admitted();
		const renew = vi.spyOn(store, 'renewStreamSlot');
		for (let i = 0; i < 9; i++) {
			advance(1_000);
			await lease.renewIfDue();
		}
		expect(renew).not.toHaveBeenCalled();
		advance(1_000);
		await lease.renewIfDue();
		expect(renew).toHaveBeenCalledTimes(1);
	});

	it('keeps the slot held past the original lease while it renews', async () => {
		const { deps, lease, advance, ticket } = await admitted();
		for (let i = 0; i < 12; i++) {
			advance(STREAM_LEASE_RENEW_MS);
			await lease.renewIfDue();
		}
		// Two more slots are free; the renewed one is not.
		await admitStream(deps, ticket(), SECRET);
		await admitStream(deps, ticket(), SECRET);
		expect((await admitStream(deps, ticket(), SECRET)).kind).toBe('refused');
		expect(lease.isHeld()).toBe(true);
	});

	it('reports the slot lost when another stream took it after a lapse', async () => {
		const { deps, lease, advance, ticket } = await admitted();
		advance(STREAM_LEASE_MS + 1);
		// Fill every slot: the lapsed one goes to a new stream.
		for (let i = 0; i < MAX_STREAMS_PER_PLAYER; i++) {
			await admitStream(deps, ticket(), SECRET);
		}
		await lease.renewIfDue();
		expect(lease.isHeld()).toBe(false);
	});

	it('survives a failed renewal write and tries again', async () => {
		const { store, lease, advance } = await admitted();
		const renew = vi
			.spyOn(store, 'renewStreamSlot')
			.mockRejectedValueOnce(new Error('throttled'));
		advance(STREAM_LEASE_RENEW_MS);
		await lease.renewIfDue();
		expect(lease.isHeld()).toBe(true);
		await lease.renewIfDue();
		expect(renew).toHaveBeenCalledTimes(2);
	});

	it('does not throw when releasing fails', async () => {
		const { store, lease } = await admitted();
		vi.spyOn(store, 'releaseStreamSlot').mockRejectedValue(new Error('down'));
		await expect(lease.release()).resolves.toBeUndefined();
		expect(lease.isHeld()).toBe(false);
	});

	it('is renewed after each sleep', async () => {
		const { lease, advance } = await admitted();
		const renew = vi.spyOn(lease, 'renewIfDue');
		const slept: number[] = [];
		const sleep = renewWhileSleeping(lease, async (ms) => {
			slept.push(ms);
			advance(ms);
		});
		await sleep(1_000);
		expect(slept).toEqual([1_000]);
		expect(renew).toHaveBeenCalledTimes(1);
	});
});
