import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { cached } from '@/lib/redis';
import { coingecko } from '@/services';
import type { CoinMarket } from '@/services/coingecko';
import { scoreToken, type TokenDiscoveryInput } from '@/lib/engines/tokenDiscovery';
import type { ScreenerFilters, TokenScore } from '@/types';

const filtersSchema = z.object({
  minMarketCap: z.number().optional(),
  maxMarketCap: z.number().optional(),
  minLiquidity: z.number().optional(),
  minVolume: z.number().optional(),
  minSmartMoneyActivity: z.number().optional(),
  minAlphaScore: z.number().optional(),
  narrative: z.string().optional(),
});

const bodySchema = z.object({
  // When save=true the filters are persisted as a CustomScreener instead of run.
  save: z.boolean().optional(),
  name: z.string().optional(),
  filters: filtersSchema.optional(),
}).passthrough();

const CACHE_TTL = 120; // seconds

/** A scored token enriched with the raw market row used for screening. */
interface ScreenableToken extends TokenScore {
  name: string;
  marketCap: number;
  volume24h: number;
  price: number;
}

function toDiscoveryInput(c: CoinMarket): TokenDiscoveryInput {
  const change = (c.price_change_percentage_24h ?? 0) / 100;
  const turnover = c.market_cap > 0 ? c.total_volume / c.market_cap : 0;
  const circFraction =
    c.total_supply && c.total_supply > 0 ? c.circulating_supply / c.total_supply : 1;
  const earliness = 1 - Math.min(1, circFraction);
  return {
    symbol: c.symbol.toUpperCase(),
    address: c.id,
    chain: 'ethereum',
    volumeGrowth: Math.max(0, turnover * 3 + Math.max(0, change)),
    walletGrowth: Math.max(0, earliness * 1.5 + Math.max(0, change)),
    smartMoneyBuying: Math.max(0, change * 2),
    socialGrowth: Math.max(0, turnover * 2),
    liquidityGrowth: Math.max(0, turnover),
  };
}

/** Build the scored token universe (cached, shared with /tokens/discover semantics). */
async function loadUniverse(): Promise<ScreenableToken[]> {
  return cached<ScreenableToken[]>('screener:universe', CACHE_TTL, async () => {
    const markets = await coingecko.getMarkets(250, 1);
    return markets.map((c) => ({
      ...scoreToken(toDiscoveryInput(c)),
      name: c.name,
      marketCap: c.market_cap,
      volume24h: c.total_volume,
      price: c.current_price,
    }));
  });
}

/** Apply ScreenerFilters to the scored universe. Alpha score is proxied by earlyGemScore. */
function applyFilters(tokens: ScreenableToken[], f: ScreenerFilters): ScreenableToken[] {
  return tokens.filter((t) => {
    if (f.minMarketCap != null && t.marketCap < f.minMarketCap) return false;
    if (f.maxMarketCap != null && t.marketCap > f.maxMarketCap) return false;
    if (f.minVolume != null && t.volume24h < f.minVolume) return false;
    if (f.minLiquidity != null && t.liquidityGrowth * 100 < f.minLiquidity) return false;
    if (f.minSmartMoneyActivity != null && t.smartMoneyBuying * 100 < f.minSmartMoneyActivity) {
      return false;
    }
    if (f.minAlphaScore != null && t.earlyGemScore < f.minAlphaScore) return false;
    if (f.narrative && !t.name.toLowerCase().includes(f.narrative.toLowerCase())) return false;
    return true;
  });
}

/**
 * GET  /api/screener            — lists the caller's saved CustomScreener rows.
 * POST /api/screener            — body ScreenerFilters (or {filters}) runs the screen.
 * POST /api/screener {save:true,name,filters} — persists a CustomScreener row.
 * Degrades to [] matches if CoinGecko is unreachable.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  const userId = req.user.id;

  if (req.method === 'GET') {
    try {
      const screeners = await prisma.customScreener.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return res.status(200).json({ data: screeners });
    } catch {
      return res.status(200).json({ data: [], degraded: true });
    }
  }

  if (req.method === 'POST') {
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    // Filters may arrive nested under `filters` or as the body itself.
    const rawFilters = parsed.data.filters ?? req.body ?? {};
    const filters = filtersSchema.parse(rawFilters) as ScreenerFilters;

    // Persist branch.
    if (parsed.data.save) {
      try {
        const screener = await prisma.customScreener.create({
          data: {
            userId,
            name: parsed.data.name ?? 'Untitled screener',
            filters: filters as object,
          },
        });
        return res.status(201).json({ data: screener });
      } catch {
        return res.status(200).json({ data: null, degraded: true });
      }
    }

    // Run branch.
    try {
      const universe = await loadUniverse();
      const matches = applyFilters(universe, filters).sort(
        (a, b) => b.earlyGemScore - a.earlyGemScore,
      );
      return res.status(200).json({ data: matches });
    } catch {
      return res.status(200).json({ data: [] as ScreenableToken[], degraded: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
