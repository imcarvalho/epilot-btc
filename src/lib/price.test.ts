import {
  fetchSpotPrice,
  getGamePrice,
  isStale,
  PRICE_CACHE_MS,
  PRICE_STALE_MS,
  PriceFetchError,
  SPOT_URL,
} from "./price";
import { MemoryStore } from "./testing/memory-store";

// Recorded from the live endpoint on 27 Sep 2026. Note the three decimals:
// Coinbase does not promise two.
const RECORDED = { data: { amount: "84650.025", base: "BTC", currency: "USD" } };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const noSleep = async () => {};

describe("fetchSpotPrice", () => {
  it("parses the recorded Coinbase response", async () => {
    const fetchImpl = vi.fn(async () => json(RECORDED));
    await expect(fetchSpotPrice({ fetchImpl, sleep: noSleep })).resolves.toBe(84650.025);
    expect(fetchImpl).toHaveBeenCalledWith(SPOT_URL, expect.anything());
  });

  it("retries a 429 with backoff, then succeeds", async () => {
    const sleep = vi.fn(noSleep);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json(RECORDED));
    await expect(fetchSpotPrice({ fetchImpl, sleep })).resolves.toBe(84650.025);
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it("gives up after the retries on a timeout", async () => {
    const sleep = vi.fn(noSleep);
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(fetchSpotPrice({ fetchImpl, sleep, retries: 2 })).rejects.toBeInstanceOf(PriceFetchError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[200], [400]]);
  });

  it("rejects a response that is not a BTC-USD price", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ data: { amount: "3000.00", base: "ETH", currency: "USD" } }),
    );
    await expect(fetchSpotPrice({ fetchImpl, sleep: noSleep, retries: 0 })).rejects.toBeInstanceOf(
      PriceFetchError,
    );
  });
});

describe("getGamePrice", () => {
  const T = 1_700_000_000_000;

  it("serves the cached price while it is fresh, without fetching", async () => {
    const store = new MemoryStore();
    store.price = { price: 100, updatedAt: T };
    const fetchSpot = vi.fn(async () => 200);
    const price = await getGamePrice({ store, fetchSpot, now: () => T + PRICE_CACHE_MS - 1 });
    expect(price).toEqual({ price: 100, updatedAt: T });
    expect(fetchSpot).not.toHaveBeenCalled();
  });

  it("refreshes and stores the price once the cache window has passed", async () => {
    const store = new MemoryStore();
    store.price = { price: 100, updatedAt: T };
    const now = T + PRICE_CACHE_MS;
    const price = await getGamePrice({ store, fetchSpot: async () => 200, now: () => now });
    expect(price).toEqual({ price: 200, updatedAt: now });
    expect(store.price).toEqual({ price: 200, updatedAt: now });
  });

  it("falls back to the last known price, with its own timestamp, when the fetch fails", async () => {
    const store = new MemoryStore();
    store.price = { price: 100, updatedAt: T };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpot = async () => {
      throw new PriceFetchError("down");
    };
    const price = await getGamePrice({ store, fetchSpot, now: () => T + 30_000 });
    expect(price).toEqual({ price: 100, updatedAt: T });
  });

  it("returns null when there has never been a price and the fetch fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpot = async () => {
      throw new PriceFetchError("down");
    };
    await expect(getGamePrice({ store: new MemoryStore(), fetchSpot, now: () => T })).resolves.toBeNull();
  });
});

describe("isStale", () => {
  it("treats a missing price as stale", () => {
    expect(isStale(null, 0)).toBe(true);
  });

  it("is fresh up to and including the threshold, stale after it", () => {
    expect(isStale({ price: 1, updatedAt: 0 }, PRICE_STALE_MS)).toBe(false);
    expect(isStale({ price: 1, updatedAt: 0 }, PRICE_STALE_MS + 1)).toBe(true);
  });
});
