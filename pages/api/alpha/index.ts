import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { cached } from '@/lib/redis';
import { binance, bybit } from '@/services';
import { detectSqueeze } from '@/lib/engines/openInterest';
import { computeAlphaScore } from '@/lib/engines/alphaScore';
import { clamp, normalize } from '@/lib/quant';
import type { AlphaScore, AlphaScoreComponents, OpenInterestSnapshot } from '@/types';

const querySchema = z.object({
  symbol: z.string().optional(),
});

/** Default symbol universe used for the top-list view. */
const DEFAULT_UNIVERSE = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

const CACHE_TTL = 60; // seconds

/**
 * Gather component sub-scores (0..100) for a symbol from available market data.
 * Funding/OI/squeeze come from exchanges; smart-money/whale/onchain/sentiment are
 * neutral baselines (50) here since they require per-symbol attribution we don't
 * derive at this layer — the engine still produces a coherent blended score.
 */
async function componentsFor(symbol: string): Promise<{ components: AlphaScoreComponents; degraded: boolean }> {
  let degraded = false;
  const snapshots: OpenInterestSnapshot[] = [];
  let change = 0;
  let funding = 0;
  let oiUsd = 0;

  const [binanceOi, bybitOi, klines] = await Promise.allSettled([
    binance.getOpenInterest(symbol),
    bybit.getOpenInterest(symbol),
    binance.getKlines(symbol, '1h', 24),
  ]);

  if (binanceOi.status === 'fulfilled') {
    snapshots.push(binanceOi.value);
    funding = binanceOi.value.fundingRate;
    oiUsd = binanceOi.value.openInterestUsd;
  } else degraded = true;
  if (bybitOi.status === 'fulfilled') snapshots.push(bybitOi.value);
  else degraded = true;

  let volumeScore = 50;
  if (klines.status === 'fulfilled' && klines.value.length > 1) {
    const closes = klines.value.map((k) => k.close);
    change = closes[0] > 0 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;
    const vol = klines.value.reduce((a, k) => a + k.volume, 0);
    // Map cumulative 24h volume into a 0..100 score (saturating ~ large notional).
    volumeScore = normalize(Math.log10(vol + 1), 0, 8);
  } else degraded = true;

  // Squeeze probability feeds the openInterest component.
  const ascending = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const squeeze = detectSqueeze(ascending, change);

  // Funding component: extreme funding (either sign) signals opportunity/risk.
  const fundingScore = clamp(50 + (funding / 0.0005) * 25);
  // OI component blends squeeze probability with raw OI magnitude.
  const oiMagnitude = normalize(Math.log10(oiUsd + 1), 0, 11);
  const oiScore = clamp(0.6 * squeeze.probability + 0.4 * oiMagnitude);

  const components: AlphaScoreComponents = {
    smartMoneyActivity: 50,
    whaleActivity: 50,
    onChain: 50,
    volume: volumeScore,
    openInterest: oiScore,
    funding: fundingScore,
    sentiment: 50,
  };
  return { components, degraded };
}

/**
 * GET /api/alpha?symbol=
 * With a symbol: gathers component sub-scores and returns its composite AlphaScore.
 * Without a symbol: returns AlphaScores for the default top symbol universe (desc).
 * Cached 60s per symbol. Degrades to neutral-component scores if exchanges fail.
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

  async function scoreSymbol(sym: string): Promise<{ score: AlphaScore; degraded: boolean }> {
    return cached(`alpha:${sym}`, CACHE_TTL, async () => {
      try {
        const { components, degraded } = await componentsFor(sym);
        return { score: computeAlphaScore(sym, components), degraded };
      } catch {
        const neutral: AlphaScoreComponents = {
          smartMoneyActivity: 50,
          whaleActivity: 50,
          onChain: 50,
          volume: 50,
          openInterest: 50,
          funding: 50,
          sentiment: 50,
        };
        return { score: computeAlphaScore(sym, neutral), degraded: true };
      }
    });
  }

  try {
    if (symbol) {
      const { score, degraded } = await scoreSymbol(symbol.toUpperCase());
      return res.status(200).json({ data: score, ...(degraded ? { degraded: true } : {}) });
    }

    const results = await Promise.all(DEFAULT_UNIVERSE.map((s) => scoreSymbol(s)));
    const degraded = results.some((r) => r.degraded);
    const list = results.map((r) => r.score).sort((a, b) => b.score - a.score);
    return res.status(200).json({ data: list, ...(degraded ? { degraded: true } : {}) });
  } catch {
    return res.status(200).json({ data: [] as AlphaScore[], degraded: true });
  }
}

export default withAuth(handler);
