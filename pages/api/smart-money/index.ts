import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { featureEnabled } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import {
  computeWalletMetrics,
  rankWallets,
  type RankableWallet,
  type WalletTrade,
} from '@/lib/engines/smartMoney';
import type { Chain, RankedWallet } from '@/types';

const querySchema = z.object({
  by: z.enum(['7d', '30d', '90d']).default('7d'),
});

/** Coerce a stored chainType string into a domain Chain (fallback ethereum). */
function toChain(chainType: string): Chain {
  const valid: Chain[] = ['ethereum', 'solana', 'bsc', 'arbitrum', 'base'];
  return valid.includes(chainType as Chain) ? (chainType as Chain) : 'ethereum';
}

/**
 * GET /api/smart-money?by=7d|30d|90d
 * Ranks tracked Wallet rows through the smart-money engine. Returns [] when no
 * wallets exist. Trade history powers metrics; wallet ROI fields are used as the
 * windowed performance proxies for ranking.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!featureEnabled('ENABLE_SMART_MONEY')) {
    return res.status(503).json({ error: 'Smart money tracking is disabled' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { by } = parsed.data;

  try {
    const wallets = await prisma.wallet.findMany({
      where: { isSmartMoney: true },
      include: {
        transactions: {
          orderBy: { blockTimestamp: 'desc' },
          take: 200,
        },
      },
      take: 200,
    });

    if (wallets.length === 0) {
      return res.status(200).json({ data: [] as RankedWallet[] });
    }

    const rankable: RankableWallet[] = wallets.map((w) => {
      // Derive trades from buy/sell transactions: BUY = capital out, SELL = realized.
      const trades: WalletTrade[] = w.transactions.map((tx) => ({
        valueUsd: tx.valueUsd,
        pnl: tx.type === 'SELL' ? tx.valueUsd * (w.roi / 100) : 0,
        openedAt: tx.blockTimestamp.getTime(),
        closedAt: tx.type === 'SELL' ? tx.blockTimestamp.getTime() : null,
      }));

      const metrics = trades.length > 0
        ? computeWalletMetrics(trades)
        : {
            roi: w.roi,
            winRate: w.winRate,
            avgHoldingPeriod: w.avgHoldingPeriod,
            riskScore: w.riskScore,
            profitFactor: w.profitFactor,
            totalTrades: 0,
            realizedPnl: 0,
          };

      // Use stored roi as the windowed performance proxy (no per-window history in schema).
      return {
        address: w.address,
        name: w.name,
        chain: toChain(w.chainType),
        metrics,
        perf7d: w.roi,
        perf30d: w.roi,
        perf90d: w.roi,
      };
    });

    const ranked = rankWallets(rankable, by);
    return res.status(200).json({ data: ranked });
  } catch {
    return res.status(200).json({ data: [] as RankedWallet[], degraded: true });
  }
}

export default withAuth(handler);
