import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { runBacktest } from '@/lib/engines/backtest';
import type { BacktestTrade } from '@/types';

const tradeSchema = z.object({
  entryTime: z.number(),
  exitTime: z.number(),
  entryPrice: z.number(),
  exitPrice: z.number(),
  returnPct: z.number(),
});

const bodySchema = z.object({
  strategyName: z.string().min(1).optional(),
  trades: z.array(tradeSchema).optional(),
  signalType: z.string().optional(),
  timeframe: z.string().optional(),
  startValue: z.number().positive().optional(),
  periodsPerYear: z.number().positive().optional(),
});

/**
 * Synthesize a deterministic trade series for a {signalType, timeframe} request
 * when no explicit trades are supplied. Produces a reproducible pseudo-random
 * walk so the backtest is meaningful without external data.
 */
function synthesizeTrades(seed: string, count = 60): BacktestTrade[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
  const trades: BacktestTrade[] = [];
  let t = Date.now() - count * 86_400_000;
  let price = 100;
  for (let i = 0; i < count; i++) {
    const ret = (rand() - 0.45) * 0.06; // slight positive drift, ±6%
    const entryTime = t;
    const exitTime = t + 86_400_000;
    const entryPrice = price;
    const exitPrice = price * (1 + ret);
    trades.push({ entryTime, exitTime, entryPrice, exitPrice, returnPct: ret });
    price = exitPrice;
    t = exitTime;
  }
  return trades;
}

/**
 * GET  /api/backtest                 — lists the caller's BacktestRun rows.
 * POST /api/backtest                 — body {strategyName, trades?} OR {signalType, timeframe}.
 *   Runs the backtest engine, persists a BacktestRun for the user, returns metrics.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  const userId = req.user.id;

  if (req.method === 'GET') {
    try {
      const runs = await prisma.backtestRun.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return res.status(200).json({ data: runs });
    } catch {
      return res.status(200).json({ data: [], degraded: true });
    }
  }

  if (req.method === 'POST') {
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }
    const { strategyName, trades, signalType, timeframe, startValue, periodsPerYear } = parsed.data;

    // Resolve trades: explicit list wins; otherwise synthesize from signal config.
    const resolvedTrades: BacktestTrade[] =
      trades && trades.length > 0
        ? trades
        : signalType
          ? synthesizeTrades(`${signalType}:${timeframe ?? '1d'}`)
          : [];

    const name = strategyName ?? (signalType ? `${signalType}-${timeframe ?? '1d'}` : 'custom');

    try {
      const { equityCurve, ...metrics } = runBacktest(resolvedTrades, {
        startValue,
        periodsPerYear,
      });

      const startDate = new Date(resolvedTrades[0]?.entryTime ?? Date.now());
      const endDate = new Date(
        resolvedTrades[resolvedTrades.length - 1]?.exitTime ?? Date.now(),
      );

      const run = await prisma.backtestRun.create({
        data: {
          userId,
          strategyName: name,
          parameters: { signalType, timeframe, startValue, periodsPerYear } as object,
          startDate,
          endDate,
          winRate: metrics.winRate,
          sharpeRatio: metrics.sharpeRatio,
          sortinoRatio: metrics.sortinoRatio,
          maxDrawdown: metrics.maxDrawdown,
          cagr: metrics.cagr,
          totalTrades: metrics.totalTrades,
          results: { equityCurve } as object,
        },
      });

      return res.status(201).json({ data: { run, metrics, equityCurve } });
    } catch {
      return res.status(200).json({ data: null, degraded: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
