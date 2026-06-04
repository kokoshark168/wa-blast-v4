/**
 * Liquidation Heatmap engine — estimates per-position liquidation prices, buckets
 * them into price levels, and surfaces magnet levels (clusters price tends to
 * gravitate toward) and stop-hunt zones (clusters just beyond round numbers).
 * Pure & deterministic.
 */
import type { LiquidationHeatmap, LiquidationLevel, Side } from '@/types';
import { childLogger } from '@/lib/logger';
import { clamp } from '@/lib/quant';

const log = childLogger('engine:liquidation');

/** Number of price buckets the relevant range is divided into. */
const DEFAULT_BUCKETS = 50;
/** How many top clusters to flag as magnet levels. */
const TOP_MAGNETS = 5;
/** Fraction of price a cluster may sit beyond a round number to be a stop-hunt zone. */
const STOP_HUNT_BAND = 0.01; // within 1% beyond a round number

/** An open perp position used to derive a liquidation estimate. */
export interface LiquidationPosition {
  entryPrice: number;
  leverage: number;
  side: Side;
  notionalUsd: number;
}

/**
 * Estimate the liquidation price for a position (isolated-margin approximation,
 * maintenance margin ignored):
 *   long  ≈ entry * (1 - 1/leverage)
 *   short ≈ entry * (1 + 1/leverage)
 */
export function liquidationPrice(p: LiquidationPosition): number {
  const inv = p.leverage > 0 ? 1 / p.leverage : 1;
  return p.side === 'long' ? p.entryPrice * (1 - inv) : p.entryPrice * (1 + inv);
}

/** Round `price` down to a "human" round number at ~the price's magnitude. */
function roundNumberFor(price: number): number {
  if (price <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(price)));
  return Math.floor(price / mag) * mag;
}

/**
 * Build a liquidation heatmap from open positions.
 *
 * 1. Estimate each position's liq price + which side it liquidates.
 * 2. Bucket liq notional into `buckets` price levels across the liq-price range.
 * 3. intensity = bucket notional / max bucket notional (0..1).
 * 4. magnetLevels = prices of the top-N notional buckets (liquidity magnets).
 * 5. stopHuntZones = bands just beyond a round number that hold a heavy cluster
 *    (where price is often pushed to trigger stops/liquidations).
 */
export function buildHeatmap(
  symbol: string,
  currentPrice: number,
  positions: LiquidationPosition[],
  buckets: number = DEFAULT_BUCKETS,
): LiquidationHeatmap {
  const generatedAt = Date.now();

  const liqs = positions
    .map((p) => ({ price: liquidationPrice(p), side: p.side, notional: p.notionalUsd }))
    .filter((l) => l.price > 0 && Number.isFinite(l.price) && l.notional > 0);

  if (liqs.length === 0) {
    return { symbol, levels: [], magnetLevels: [], stopHuntZones: [], generatedAt };
  }

  const minP = Math.min(...liqs.map((l) => l.price));
  const maxP = Math.max(...liqs.map((l) => l.price));
  const span = maxP - minP;
  // Bucket width; guard against a single-price degenerate range.
  const width = span > 0 ? span / buckets : Math.max(maxP * 0.0001, 1e-9);

  // Aggregate notional per bucket, tracking dominant liquidation side.
  interface Bucket { notional: number; long: number; short: number; }
  const map = new Map<number, Bucket>();
  for (const l of liqs) {
    const idx = span > 0 ? Math.min(buckets - 1, Math.floor((l.price - minP) / width)) : 0;
    const b = map.get(idx) ?? { notional: 0, long: 0, short: 0 };
    b.notional += l.notional;
    if (l.side === 'long') b.long += l.notional;
    else b.short += l.notional;
    map.set(idx, b);
  }

  const maxNotional = Math.max(...[...map.values()].map((b) => b.notional));

  const levels: LiquidationLevel[] = [...map.entries()]
    .map(([idx, b]) => ({
      price: minP + (idx + 0.5) * width,
      notional: b.notional,
      side: (b.long >= b.short ? 'long' : 'short') as Side,
      intensity: clamp(maxNotional > 0 ? b.notional / maxNotional : 0, 0, 1),
    }))
    .sort((a, b) => a.price - b.price);

  // Magnet levels: heaviest clusters (price gravitates toward liquidity).
  const magnetLevels = [...levels]
    .sort((a, b) => b.notional - a.notional)
    .slice(0, TOP_MAGNETS)
    .map((l) => l.price)
    .sort((a, b) => a - b);

  // Stop-hunt zones: heavy clusters sitting just beyond a round number relative
  // to current price — where price is often wicked to trigger stops.
  const significant = levels.filter((l) => l.intensity >= 0.5);
  const stopHuntZones = significant
    .map((l) => {
      const round = roundNumberFor(l.price);
      const beyond = Math.abs(l.price - round) / (l.price || 1);
      if (beyond <= STOP_HUNT_BAND) {
        const lo = Math.min(round, l.price);
        const hi = Math.max(round, l.price);
        return { low: lo, high: hi };
      }
      return null;
    })
    .filter((z): z is { low: number; high: number } => z !== null);

  log.debug(
    { symbol, levels: levels.length, magnets: magnetLevels.length, currentPrice },
    'heatmap built',
  );

  return { symbol, levels, magnetLevels, stopHuntZones, generatedAt };
}
