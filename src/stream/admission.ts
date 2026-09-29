/**
 * Who may open a game stream, and for how many at once (engineering spec
 * §3.1).
 *
 * The stream's Function URL is public, so the ticket is the only gate, and a
 * ticket alone is not enough: it would open as many streams as a holder
 * cared to, for its whole minute. Each stream holds a Lambda execution for
 * minutes and the account has ten, so admission has two more rules:
 *
 * - A ticket is single-use. Its `jti` is spent with a conditional write when
 *   the stream opens; a replay is refused.
 * - A player has at most `MAX_STREAMS_PER_PLAYER` live streams (two tabs and
 *   a spare, not one, so a second tab is a supported case). Each holds a
 *   slot, a lease of `STREAM_LEASE_MS` that the stream renews every
 *   `STREAM_LEASE_RENEW_MS` and frees when it ends. A stream that dies
 *   without freeing its slot loses it when the lease lapses. When every slot
 *   is held the new stream is refused, not allowed to displace an older one:
 *   displacing would let a replayed ticket churn streams faster than the
 *   evicted ones notice.
 *
 * Renewal costs one conditional write per stream every ten seconds, and no
 * read on the stream's one-second tick. Host-independent, like
 * `runGameStream`: the Lambda and the local route both call it.
 */

import { randomUUID } from 'node:crypto';
import type { GameDeps } from '@/lib/game';
import type { StreamSlot } from '@/lib/store';
import { verifyStreamToken } from '@/lib/stream-token';

export const MAX_STREAMS_PER_PLAYER = 3;
/** Long enough to miss two renewals (or ride out a slow write) and keep the slot. */
export const STREAM_LEASE_MS = 30_000;
export const STREAM_LEASE_RENEW_MS = 10_000;

export type Refusal = 'invalid-ticket' | 'ticket-spent' | 'too-many-streams';

/** The HTTP status each refusal is answered with. */
export const REFUSAL_STATUS: Record<Refusal, number> = {
	'invalid-ticket': 401,
	'ticket-spent': 401,
	'too-many-streams': 429,
};

/** A held stream slot: renewed as the stream runs, freed when it ends. */
export interface StreamLease {
	/** False once a renewal found the slot gone: the stream must end. */
	isHeld(): boolean;
	/** Renews the lease if ten seconds have passed since it last was. Never throws. */
	renewIfDue(): Promise<void>;
	/** Frees the slot. Never throws. */
	release(): Promise<void>;
}

export type Admission =
	| {
			kind: 'admitted';
			playerId: string;
			lease: StreamLease;
	  }
	| {
			kind: 'refused';
			reason: Refusal;
	  };

type AdmissionDeps = Pick<GameDeps, 'store' | 'now'>;

export async function admitStream(
	deps: AdmissionDeps,
	token: string,
	secret: string,
	streamId: string = randomUUID(),
): Promise<Admission> {
	const { store, now } = deps;
	const claims = verifyStreamToken(token, secret, now());
	if (!claims) {
		return {
			kind: 'refused',
			reason: 'invalid-ticket',
		};
	}
	if (!(await store.spendTicket(claims.jti, claims.expiresAt))) {
		return {
			kind: 'refused',
			reason: 'ticket-spent',
		};
	}
	const { playerId } = claims;
	const claimedAt = now();
	const slotNumber = await store.claimStreamSlot(
		playerId,
		streamId,
		claimedAt,
		STREAM_LEASE_MS,
		MAX_STREAMS_PER_PLAYER,
	);
	if (slotNumber === null) {
		return {
			kind: 'refused',
			reason: 'too-many-streams',
		};
	}

	const slot: StreamSlot = {
		slot: slotNumber,
		streamId,
	};
	let held = true;
	let renewedAt = claimedAt;
	return {
		kind: 'admitted',
		playerId,
		lease: {
			isHeld: () => held,
			async renewIfDue() {
				const at = now();
				if (!held || at - renewedAt < STREAM_LEASE_RENEW_MS) {
					return;
				}
				try {
					if (
						await store.renewStreamSlot(playerId, slot, at, STREAM_LEASE_MS)
					) {
						renewedAt = at;
					} else {
						held = false;
					}
				} catch {
					// A failed write is not a lost slot: try again on the next tick.
					// The lease outlasts two missed renewals.
				}
			},
			async release() {
				held = false;
				try {
					await store.releaseStreamSlot(playerId, slot);
				} catch {
					// The lease lapses by itself.
				}
			},
		},
	};
}

/** Wraps the stream's sleep so each wake-up also renews the lease. */
export function renewWhileSleeping(
	lease: StreamLease,
	sleep: (ms: number) => Promise<void>,
): (ms: number) => Promise<void> {
	return async (ms) => {
		await sleep(ms);
		await lease.renewIfDue();
	};
}
