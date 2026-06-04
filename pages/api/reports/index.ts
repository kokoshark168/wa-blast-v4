import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { cached, getRedis } from '@/lib/redis';
import { generateReport, type ReportContext } from '@/lib/engines/aiResearch';
import { buildWhaleTransaction, type RawWhaleTransfer, type WhaleContext } from '@/lib/engines/whale';
import { estimateMarketImpact } from '@/lib/engines/onchain';
import { analyzeSentiment } from '@/lib/engines/sentiment';
import type {
  Chain,
  MarketReport,
  OnChainSignal,
  ReportPeriod,
  SentimentSignal,
  WhaleTransaction,
} from '@/types';

const querySchema = z.object({
  period: z.enum(['hourly', 'daily', 'weekly']).default('daily'),
});

const VALID_CHAINS: Chain[] = ['ethereum', 'solana', 'bsc', 'arbitrum', 'base'];
const VALID_METRICS: OnChainSignal['metricType'][] = [
  'NEW_WALLETS',
  'LARGE_TRANSFER',
  'EXCHANGE_RESERVE',
  'STABLE_INFLOW',
  'STABLE_OUTFLOW',
];

function toChain(c: string): Chain {
  return VALID_CHAINS.includes(c as Chain) ? (c as Chain) : 'ethereum';
}

/** Lookback window (ms) per report period. */
const WINDOW_MS: Record<ReportPeriod, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Assemble the signal context for a report from recent prisma rows. */
async function buildContext(period: ReportPeriod): Promise<ReportContext> {
  const since = new Date(Date.now() - WINDOW_MS[period]);

  const [whaleRows, smartWallets, onchainRows, socialRows] = await Promise.all([
    prisma.transaction.findMany({
      where: { isWhaleTransaction: true, blockTimestamp: { gte: since } },
      orderBy: { blockTimestamp: 'desc' },
      take: 100,
    }),
    prisma.wallet.findMany({ where: { isSmartMoney: true }, select: { address: true } }),
    prisma.onChainMetric.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 100,
    }),
    prisma.socialSignal.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 50,
    }),
  ]);

  const smartSet = new Set(smartWallets.map((w) => w.address.toLowerCase()));
  const ctx: WhaleContext = {
    isExchangeAddress: () => false,
    isSmartMoney: (addr) => smartSet.has(addr.toLowerCase()),
  };

  const whales: WhaleTransaction[] = whaleRows
    .map((tx) =>
      buildWhaleTransaction(
        {
          txHash: tx.txHash,
          chain: toChain(tx.chainType),
          from: tx.fromAddress,
          to: tx.toAddress,
          tokenSymbol: tx.tokenSymbol,
          tokenAddress: tx.tokenAddress,
          amount: tx.quantity,
          valueUsd: tx.valueUsd,
          timestamp: tx.blockTimestamp.getTime(),
        } satisfies RawWhaleTransfer,
        ctx,
      ),
    )
    .filter((w): w is WhaleTransaction => w !== null);

  const onchain: OnChainSignal[] = onchainRows
    .map((r) => {
      const metricType = VALID_METRICS.includes(r.metricType as OnChainSignal['metricType'])
        ? (r.metricType as OnChainSignal['metricType'])
        : null;
      if (!metricType) return null;
      return estimateMarketImpact({
        chain: toChain(r.chainType),
        metricType,
        value: r.value,
        timestamp: r.timestamp.getTime(),
      });
    })
    .filter((s): s is OnChainSignal => s !== null);

  const sentiment: SentimentSignal[] = socialRows.map((s) =>
    analyzeSentiment({
      keyword: s.keyword,
      mentionsNow: s.mentionCount,
      mentionsPrev: Math.floor(s.mentionCount / 2),
      // Re-derive a polarity split from the stored sentiment score.
      positive: s.sentimentScore > 0 ? Math.round(s.mentionCount * Math.abs(s.sentimentScore)) : 0,
      negative: s.sentimentScore < 0 ? Math.round(s.mentionCount * Math.abs(s.sentimentScore)) : 0,
      neutral: Math.round(s.mentionCount * (1 - Math.abs(s.sentimentScore))),
      platform: (['twitter', 'reddit', 'telegram'].includes(s.platform)
        ? s.platform
        : 'aggregate') as SentimentSignal['platform'],
      windowHours: 1,
    }),
  );

  // No persisted alpha scores or squeeze signals in the schema; pass empty sets.
  // The report engine handles partial context cleanly.
  return { alphaScores: [], whales, squeezes: [], sentiment, onchain };
}

const REPORT_TTL = 300; // seconds — cached report freshness

/**
 * GET  /api/reports?period=hourly|daily|weekly  — cached assembled report.
 * POST /api/reports?period=...                  — forces regeneration (busts cache).
 * Degrades to an empty-but-valid report if the DB read fails.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { period } = parsed.data;
  const cacheKey = `reports:${period}`;

  try {
    // POST forces regeneration by clearing the cached entry first.
    if (req.method === 'POST') {
      const redis = await getRedis();
      if (redis) await redis.del(cacheKey);
    }

    const report = await cached<MarketReport>(cacheKey, REPORT_TTL, async () => {
      const context = await buildContext(period);
      return generateReport(period, context);
    });

    return res.status(200).json({ data: report });
  } catch {
    const empty: MarketReport = {
      period,
      generatedAt: Date.now(),
      summary: 'Report unavailable — underlying signal context could not be assembled.',
      bullishFactors: [],
      bearishFactors: [],
      riskFactors: [],
      keyLevels: [],
    };
    return res.status(200).json({ data: empty, degraded: true });
  }
}

export default withAuth(handler);
