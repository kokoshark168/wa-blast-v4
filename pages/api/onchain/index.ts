import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { estimateMarketImpact } from '@/lib/engines/onchain';
import type { Chain, OnChainSignal } from '@/types';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const VALID_CHAINS: Chain[] = ['ethereum', 'solana', 'bsc', 'arbitrum', 'base'];
const VALID_METRICS: OnChainSignal['metricType'][] = [
  'NEW_WALLETS',
  'LARGE_TRANSFER',
  'EXCHANGE_RESERVE',
  'STABLE_INFLOW',
  'STABLE_OUTFLOW',
];

function toChain(chainType: string): Chain {
  return VALID_CHAINS.includes(chainType as Chain) ? (chainType as Chain) : 'ethereum';
}

function toMetric(metricType: string): OnChainSignal['metricType'] | null {
  return VALID_METRICS.includes(metricType as OnChainSignal['metricType'])
    ? (metricType as OnChainSignal['metricType'])
    : null;
}

/**
 * GET /api/onchain?limit=
 * Returns recent OnChainMetric rows mapped to OnChainSignals with a directional
 * market-impact estimate from the on-chain engine. Degrades to [] on DB error.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { limit } = parsed.data;

  try {
    const rows = await prisma.onChainMetric.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    const signals: OnChainSignal[] = rows
      .map((r) => {
        const metricType = toMetric(r.metricType);
        if (!metricType) return null;
        return estimateMarketImpact({
          chain: toChain(r.chainType),
          metricType,
          value: r.value,
          timestamp: r.timestamp.getTime(),
        });
      })
      .filter((s): s is OnChainSignal => s !== null);

    return res.status(200).json({ data: signals });
  } catch {
    return res.status(200).json({ data: [] as OnChainSignal[], degraded: true });
  }
}

export default withAuth(handler);
