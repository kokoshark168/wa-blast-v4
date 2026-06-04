import type { NextApiResponse } from 'next';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { cached } from '@/lib/redis';
import { coingecko } from '@/services';
import type { CoinMarket } from '@/services/coingecko';
import { scoreToken, type TokenDiscoveryInput } from '@/lib/engines/tokenDiscovery';
import type { TokenScore } from '@/types';

const CACHE_TTL = 120; // seconds

/**
 * Derive growth proxies from a CoinMarket row. We lack historical series here, so
 * we approximate growth from 24h price change, volume/market-cap turnover and
 * supply maturity — enough to differentiate fresh momentum from stale large caps.
 */
function toDiscoveryInput(c: CoinMarket): TokenDiscoveryInput {
  const change = (c.price_change_percentage_24h ?? 0) / 100; // decimal
  // Volume turnover: high daily volume relative to cap implies churn/interest.
  const turnover = c.market_cap > 0 ? c.total_volume / c.market_cap : 0;
  // Supply maturity: fraction circulating; less-circulated = earlier-stage proxy.
  const circFraction =
    c.total_supply && c.total_supply > 0 ? c.circulating_supply / c.total_supply : 1;
  const earliness = 1 - Math.min(1, circFraction); // 0 mature .. 1 early

  return {
    symbol: c.symbol.toUpperCase(),
    address: c.id, // CoinGecko id stands in for an address here
    chain: 'ethereum',
    volumeGrowth: Math.max(0, turnover * 3 + Math.max(0, change)),
    walletGrowth: Math.max(0, earliness * 1.5 + Math.max(0, change)),
    smartMoneyBuying: Math.max(0, change * 2),
    socialGrowth: Math.max(0, turnover * 2),
    liquidityGrowth: Math.max(0, turnover),
  };
}

/**
 * GET /api/tokens/discover
 * Scans CoinGecko markets, derives growth proxies, scores each token through the
 * discovery engine, and returns them sorted by earlyGemScore (desc). Cached 120s.
 * Degrades to [] if CoinGecko is unreachable.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const scored = await cached<TokenScore[]>('tokens:discover', CACHE_TTL, async () => {
      const markets = await coingecko.getMarkets(250, 1);
      return markets
        .map((c) => scoreToken(toDiscoveryInput(c)))
        .sort((a, b) => b.earlyGemScore - a.earlyGemScore);
    });
    return res.status(200).json({ data: scored });
  } catch {
    return res.status(200).json({ data: [] as TokenScore[], degraded: true });
  }
}

export default withAuth(handler);
