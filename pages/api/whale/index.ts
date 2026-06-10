import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { featureEnabled } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { buildWhaleTransaction, type RawWhaleTransfer, type WhaleContext } from '@/lib/engines/whale';
import type { Chain, WhaleTier, WhaleTransaction } from '@/types';

const querySchema = z.object({
  tier: z.enum(['100k', '1m', '10m']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function toChain(chainType: string): Chain {
  const valid: Chain[] = ['ethereum', 'solana', 'bsc', 'arbitrum', 'base'];
  return valid.includes(chainType as Chain) ? (chainType as Chain) : 'ethereum';
}

/** Tier ordering for filtering at-or-above a requested floor. */
const TIER_RANK: Record<WhaleTier, number> = { '100k': 1, '1m': 2, '10m': 3 };

/**
 * GET /api/whale?tier=100k|1m|10m&limit=
 * Returns recent whale transactions (Transaction.isWhaleTransaction) classified
 * via the whale engine. tier filters to transactions at-or-above the given tier.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!featureEnabled('ENABLE_WHALE_TRACKING')) {
    return res.status(503).json({ error: 'Whale tracking is disabled' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { tier, limit } = parsed.data;

  try {
    const rows = await prisma.transaction.findMany({
      where: { isWhaleTransaction: true },
      orderBy: { blockTimestamp: 'desc' },
      take: limit,
    });

    // Resolve smart-money labels for the addresses involved (deterministic context).
    const smartWallets = await prisma.wallet.findMany({
      where: { isSmartMoney: true },
      select: { address: true },
    });
    const smartSet = new Set(smartWallets.map((w) => w.address.toLowerCase()));

    const ctx: WhaleContext = {
      // No exchange-label table in schema; treat none as exchange (engine handles gracefully).
      isExchangeAddress: () => false,
      isSmartMoney: (addr) => smartSet.has(addr.toLowerCase()),
    };

    const whales = rows
      .map((tx) => {
        const raw: RawWhaleTransfer = {
          txHash: tx.txHash,
          chain: toChain(tx.chainType),
          from: tx.fromAddress,
          to: tx.toAddress,
          tokenSymbol: tx.tokenSymbol,
          tokenAddress: tx.tokenAddress,
          amount: tx.quantity,
          valueUsd: tx.valueUsd,
          timestamp: tx.blockTimestamp.getTime(),
        };
        return buildWhaleTransaction(raw, ctx);
      })
      .filter((w): w is WhaleTransaction => w !== null)
      .filter((w) => (tier ? TIER_RANK[w.tier] >= TIER_RANK[tier] : true));

    return res.status(200).json({ data: whales });
  } catch {
    return res.status(200).json({ data: [] as WhaleTransaction[], degraded: true });
  }
}

export default withAuth(handler);
