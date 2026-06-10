import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { cached } from '@/lib/redis';
import { binance } from '@/services';
import { buildHeatmap, type LiquidationPosition } from '@/lib/engines/liquidation';
import type { LiquidationHeatmap, Side } from '@/types';

const querySchema = z.object({
  symbol: z.string().default('BTCUSDT'),
});

const CACHE_TTL = 60; // seconds

/**
 * Synthesize a plausible spread of leveraged positions around the current price
 * when no real Position rows exist, scaled by total open-interest notional. This
 * keeps the heatmap meaningful using only public OI data.
 */
function synthesizeFromOi(currentPrice: number, oiNotionalUsd: number): LiquidationPosition[] {
  if (currentPrice <= 0 || oiNotionalUsd <= 0) return [];
  const leverages = [5, 10, 20, 25, 50];
  const positions: LiquidationPosition[] = [];
  // Distribute notional across leverage tiers and both sides, with slight entry
  // dispersion so liquidation prices spread into distinct buckets.
  for (const lev of leverages) {
    for (const side of ['long', 'short'] as Side[]) {
      for (let i = -2; i <= 2; i++) {
        const entry = currentPrice * (1 + i * 0.004);
        positions.push({
          entryPrice: entry,
          leverage: lev,
          side,
          notionalUsd: oiNotionalUsd / (leverages.length * 2 * 5),
        });
      }
    }
  }
  return positions;
}

/**
 * GET /api/liquidations?symbol=BTCUSDT
 * Builds a liquidation heatmap from stored Position rows for the symbol, or
 * synthesizes one from live open interest when none exist. Cached 60s.
 * Degrades to an empty heatmap if everything upstream is unavailable.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { symbol } = parsed.data;

  try {
    const result = await cached(`liquidations:${symbol}`, CACHE_TTL, async () => {
      let degraded = false;

      // Live OI snapshot drives current price + synthetic positions fallback.
      let currentPrice = 0;
      let oiNotionalUsd = 0;
      try {
        const [oi, klines] = await Promise.all([
          binance.getOpenInterest(symbol),
          binance.getKlines(symbol, '1h', 1),
        ]);
        oiNotionalUsd = oi.openInterestUsd;
        currentPrice = klines[klines.length - 1]?.close ?? 0;
        if (currentPrice === 0 && oi.openInterest > 0) {
          currentPrice = oi.openInterestUsd / oi.openInterest;
        }
      } catch {
        degraded = true;
      }

      // Prefer real open positions for this symbol.
      const rows = await prisma.position.findMany({
        where: { symbol, closedAt: null },
        take: 1000,
      });

      let positions: LiquidationPosition[];
      if (rows.length > 0) {
        positions = rows.map((p) => ({
          entryPrice: p.entryPrice,
          leverage: p.leverage,
          side: (p.side === 'short' ? 'short' : 'long') as Side,
          notionalUsd: Math.abs(p.positionSize * p.entryPrice),
        }));
        if (currentPrice === 0) {
          currentPrice = rows[0].currentPrice || rows[0].entryPrice;
        }
      } else {
        positions = synthesizeFromOi(currentPrice, oiNotionalUsd);
      }

      const heatmap = buildHeatmap(symbol, currentPrice, positions);
      return { heatmap, currentPrice, source: rows.length > 0 ? 'positions' : 'synthetic', degraded };
    });

    const { degraded, ...data } = result;
    return res.status(200).json({ data, ...(degraded ? { degraded: true } : {}) });
  } catch {
    const empty: LiquidationHeatmap = {
      symbol,
      levels: [],
      magnetLevels: [],
      stopHuntZones: [],
      generatedAt: Date.now(),
    };
    return res.status(200).json({
      data: { heatmap: empty, currentPrice: 0, source: 'none' },
      degraded: true,
    });
  }
}

export default withAuth(handler);
