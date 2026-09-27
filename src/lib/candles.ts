/**
 * The last hour of one-minute candles, for the chart (product spec §5).
 *
 * Engineering spec §5 and §7.1: the chart is cosmetic, so the browser fetches
 * it from Coinbase directly (CORS checked open on day one) and it never
 * affects an outcome. It is drawn as hand-built SVG, four paths in all: up
 * bodies, down bodies, up wicks, down wicks. Everything here is pure, so the
 * geometry is tested without a browser.
 */

import { z } from "zod";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export interface Candle {
  /** Start of the minute, epoch ms. */
  time: number;
  low: number;
  high: number;
  open: number;
  close: number;
}

/** One hour of one-minute candles ending at `now`. */
export function candlesUrl(now: number): string {
  const params = new URLSearchParams({
    granularity: "60",
    start: new Date(now - HOUR_MS).toISOString(),
    end: new Date(now).toISOString(),
  });
  return `https://api.exchange.coinbase.com/products/BTC-USD/candles?${params}`;
}

// Coinbase: [time (s), low, high, open, close, volume], newest first.
const RowsSchema = z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]));

export function parseCandles(raw: unknown): Candle[] {
  return RowsSchema.parse(raw)
    .map(([time, low, high, open, close]) => ({ time: time * 1000, low, high, open, close }))
    .sort((a, b) => a.time - b.time);
}

/** "+$1,244.80 in the last hour": last close against the first open. */
export function hourChange(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  return candles[candles.length - 1].close - candles[0].open;
}

export interface ChartSize {
  width: number;
  height: number;
  /** Right edge of the chart, epoch ms. The left edge is an hour earlier. */
  windowEnd: number;
  /** Vertical breathing room, so the extremes do not touch the edges. */
  padding?: number;
}

export interface PlacedCandle {
  x: number;
  up: boolean;
  bodyY: number;
  bodyHeight: number;
  highY: number;
  lowY: number;
}

export interface CandleChart {
  upBodies: string;
  downBodies: string;
  upWicks: string;
  downWicks: string;
  candles: PlacedCandle[];
  /** Where the dashed line at the latest price goes; null with no candles. */
  lastCloseY: number | null;
  yFor: (price: number) => number;
}

/** A flat candle (open = close) still draws as a visible dash. */
const MIN_BODY = 1.5;

export function buildCandleChart(candles: Candle[], { width, height, windowEnd, padding = 8 }: ChartSize): CandleChart {
  const windowStart = windowEnd - HOUR_MS;
  const slot = width / 60;
  const bodyWidth = Math.max(1, slot * 0.55);

  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const span = hi - lo;
  const inner = height - 2 * padding;
  // An hour without a single price change is a flat line through the middle.
  const yFor = (price: number) => (span > 0 ? padding + ((hi - price) / span) * inner : height / 2);

  const paths = { upBodies: "", downBodies: "", upWicks: "", downWicks: "" };
  const placed: PlacedCandle[] = [];

  for (const c of candles) {
    const x = ((c.time - windowStart) / MINUTE_MS + 0.5) * slot;
    const up = c.close >= c.open;
    const top = yFor(Math.max(c.open, c.close));
    const bottom = yFor(Math.min(c.open, c.close));
    const bodyHeight = Math.max(MIN_BODY, bottom - top);
    const bodyY = (top + bottom) / 2 - bodyHeight / 2;
    const highY = yFor(c.high);
    const lowY = yFor(c.low);

    const body = `M${r(x - bodyWidth / 2)} ${r(bodyY)}h${r(bodyWidth)}v${r(bodyHeight)}h${r(-bodyWidth)}Z`;
    const wick = `M${r(x)} ${r(highY)}V${r(lowY)}`;
    if (up) {
      paths.upBodies += body;
      paths.upWicks += wick;
    } else {
      paths.downBodies += body;
      paths.downWicks += wick;
    }
    placed.push({ x, up, bodyY, bodyHeight, highY, lowY });
  }

  const last = candles[candles.length - 1];
  return { ...paths, candles: placed, lastCloseY: last ? yFor(last.close) : null, yFor };
}

/** Two decimals are plenty for pixels, and keep the path strings short. */
const r = (n: number) => Math.round(n * 100) / 100;
