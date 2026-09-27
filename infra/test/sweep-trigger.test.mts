import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../lambda/sweep-trigger/index.mjs';

const URL = 'https://example.test/api/cron/resolve';
const ok = (body: unknown) =>
	new Response(JSON.stringify(body), { status: 200 });

describe('sweep trigger', () => {
	it('POSTs to the sweep route with the secret header, and returns its result', async () => {
		const fetchImpl = vi.fn(async () =>
			ok({ due: 1, resolved: 1, priceStale: false }),
		);
		const handler = createHandler({
			url: URL,
			getSecret: async () => 's3cret',
			fetchImpl,
			log: () => {},
		});

		await expect(handler()).resolves.toEqual({
			due: 1,
			resolved: 1,
			priceStale: false,
		});
		expect(fetchImpl).toHaveBeenCalledWith(
			URL,
			expect.objectContaining({
				method: 'POST',
				headers: { 'x-cron-secret': 's3cret' },
			}),
		);
	});

	it('reads the secret once per cold start, not once per run', async () => {
		const getSecret = vi.fn(async () => 's3cret');
		const handler = createHandler({
			url: URL,
			getSecret,
			fetchImpl: async () => ok({}),
			log: () => {},
		});

		await handler();
		await handler();
		expect(getSecret).toHaveBeenCalledTimes(1);
	});

	it('throws on a failed sweep, so it counts as an error rather than a quiet success', async () => {
		const handler = createHandler({
			url: URL,
			getSecret: async () => 's3cret',
			fetchImpl: async () => new Response('boom', { status: 500 }),
			log: () => {},
		});
		await expect(handler()).rejects.toThrow('sweep responded 500');
	});

	it('re-reads the secret after a 401, so a rotation heals itself', async () => {
		const getSecret = vi
			.fn()
			.mockResolvedValueOnce('old')
			.mockResolvedValueOnce('new');
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('{"error":"unauthorized"}', { status: 401 }),
			)
			.mockResolvedValueOnce(ok({}));
		const handler = createHandler({
			url: URL,
			getSecret,
			fetchImpl,
			log: () => {},
		});

		await expect(handler()).rejects.toThrow('401');
		await handler();
		expect(fetchImpl.mock.calls[1][1].headers).toEqual({
			'x-cron-secret': 'new',
		});
	});
});
