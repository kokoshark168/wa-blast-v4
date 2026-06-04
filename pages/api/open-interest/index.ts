import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { binance, bybit } from '@/services';
import { detectSqueeze } from '@/lib/engines/openInterest';
import type { OpenInterestSnapshot, SqueezeSignal } from '@/types';

const querySchema = z.object({
  symbol: z.string().default('BTCUSDT'),
});

/** Compute recent price change % from klines (first vs last close). */
function priceChangePct(closes: number[]): number {
  if (closes.length < 2) return 0;
  const first = closes[0];
  const last = closes[closes.length - 1];
  return first > 0 ? ((last - first) / first) * 100 : 0;
}

/**
 * GET /api/open-interest?symbol=BTCUSDT
 * Pulls OI snapshots from Binance + Bybit, derives recent price action, and runs
 * the squeeze detector. Degrades to an empty snapshot set + NEUTRAL signal if the
 * exchanges are unreachable.
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

  const snapshots: OpenInterestSnapshot[] = [];
  let degraded = false;

  // Each external call is isolated so one failing exchange doesn't sink the route.
  const [binanceOi, bybitOi, klines] = await Promise.allSettled([
    binance.getOpenInterest(symbol),
    bybit.getOpenInterest(symbol),
    binance.getKlines(symbol, '1h', 24),
  ]);

  if (binanceOi.status === 'fulfilled') snapshots.push(binanceOi.value);
  else degraded = true;
  if (bybitOi.status === 'fulfilled') snapshots.push(bybitOi.value);
  else degraded = true;

  let change = 0;
  if (klines.status === 'fulfilled') {
    change = priceChangePct(klines.value.map((k) => k.close));
  } else {
    degraded = true;
  }

  // detectSqueeze needs ascending-by-time series; sort defensively.
  const ascending = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const signal: SqueezeSignal = detectSqueeze(ascending, change);

  return res.status(200).json({
    data: { symbol, snapshots, priceChangePct: change, signal },
    ...(degraded ? { degraded: true } : {}),
  });
}

export default withAuth(handler);
