/**
 * Controls of the fake Coinbase (fake-coinbase.mjs): hold the market flat so
 * a guess stays at "time is up", waiting for a price that never changes.
 * Only there when the tests run against the fake, not the live API.
 */

const CONTROL = `http://localhost:${process.env.FAKE_COINBASE_PORT ?? 3102}/__control`;

/** Whether the tests run against the real Coinbase, where the market cannot be controlled. */
export const LIVE_COINBASE = Boolean(process.env.E2E_LIVE_COINBASE);

async function control(body: object) {
	const res = await fetch(CONTROL, {
		method: 'POST',
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(
			`the fake Coinbase refused the control message: ${res.status}`,
		);
	}
}

/** The price stays at `price` from `since` (epoch ms) on. */
export const holdMarketFlat = (price: number, since: number) =>
	control({
		flatFrom: since,
		price,
	});

/** Lets the market move again. */
export const releaseMarket = () => control({});
