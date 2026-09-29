/**
 * Who is calling, as far as a rate limit needs to know (engineering spec §8).
 *
 * On Amplify Hosting the app sits behind CloudFront, which appends the
 * address it accepted the connection from to `x-forwarded-for`. Anything to
 * the left of that was sent by the client and can say whatever it likes, so
 * the trusted address is counted from the right: with one trusted proxy, the
 * last entry. `TRUSTED_PROXY_HOPS` says how many proxies of ours sit in front
 * of the app if that ever changes (default 1).
 *
 * The address is only ever stored hashed, keyed with a server secret so a
 * table dump cannot be reversed by trying every IPv4 address.
 */

import { createHmac } from 'node:crypto';

/** The trusted client address from an `x-forwarded-for` value, or null if there is none. */
export function clientIpFrom(
	forwardedFor: string | null,
	hopsFromRight = 1,
): string | null {
	if (!forwardedFor) {
		return null;
	}
	const hops = forwardedFor
		.split(',')
		.map((hop) => hop.trim())
		.filter(Boolean);
	const ip = hops[hops.length - hopsFromRight];
	return ip ?? null;
}

/** A stable, non-reversible token for an address, safe to store and to put in a key. */
export function hashIp(ip: string, secret: string): string {
	return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}
