import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { featureEnabled } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { hyperliquid } from '@/services';
import type { HyperliquidPosition } from '@/types';

const querySchema = z.object({
  wallets: z.string().optional(),
});

/**
 * GET /api/hyperliquid?wallets=addr,addr
 * Returns the largest long/short positions across the supplied wallets, or a
 * default tracked set (ethereum smart-money wallets). Returns [] when no wallets
 * are available, and degrades to [] if the upstream API is unreachable.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!featureEnabled('ENABLE_HYPERLIQUID')) {
    return res.status(503).json({ error: 'Hyperliquid monitoring is disabled' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }

  try {
    let wallets: string[];
    if (parsed.data.wallets) {
      wallets = parsed.data.wallets
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
    } else {
      const tracked = await prisma.wallet.findMany({
        where: { chainType: 'ethereum', isSmartMoney: true },
        select: { address: true },
        take: 100,
      });
      wallets = tracked.map((w) => w.address);
    }

    if (wallets.length === 0) {
      return res.status(200).json({ data: [] as HyperliquidPosition[] });
    }

    const positions = await hyperliquid.getLargestPositions(wallets);
    return res.status(200).json({ data: positions });
  } catch {
    return res.status(200).json({ data: [] as HyperliquidPosition[], degraded: true });
  }
}

export default withAuth(handler);
