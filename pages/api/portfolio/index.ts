import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';

/**
 * A single portfolio holding. Holdings are stored inside the Portfolio.allocations
 * JSON blob (the schema has no dedicated holdings table for portfolios), under the
 * `holdings` key; computed sector/asset allocation is stored alongside on write.
 */
const holdingSchema = z.object({
  symbol: z.string().min(1),
  quantity: z.number().nonnegative(),
  avgEntryPrice: z.number().nonnegative(),
  currentPrice: z.number().nonnegative(),
  sector: z.string().optional(),
  /** Optional per-holding risk weight 0..1 (e.g. volatility/leverage proxy). */
  riskWeight: z.number().min(0).max(1).optional(),
});

type Holding = z.infer<typeof holdingSchema>;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  holdings: z.array(holdingSchema).default([]),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  holdings: z.array(holdingSchema),
});

interface PortfolioComputation {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPercent: number;
  riskExposure: number;
  allocations: Record<string, number>; // symbol -> % of portfolio value
  sectorAllocations: Record<string, number>; // sector -> % of portfolio value
  rebalancing: { symbol: string; action: 'TRIM' | 'ADD'; reason: string }[];
  riskWarnings: string[];
}

/** Target maximum single-asset concentration before a TRIM is suggested. */
const MAX_CONCENTRATION = 0.35;
/** Concentration below this triggers an ADD (underweight) suggestion. */
const MIN_MEANINGFUL = 0.02;

/** Compute value, PnL, allocations, risk exposure and naive rebalancing advice. */
function computePortfolio(holdings: Holding[]): PortfolioComputation {
  const totalValue = holdings.reduce((a, h) => a + h.quantity * h.currentPrice, 0);
  const totalCost = holdings.reduce((a, h) => a + h.quantity * h.avgEntryPrice, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const allocations: Record<string, number> = {};
  const sectorFractions: Record<string, number> = {};
  const sectorAllocations: Record<string, number> = {};
  let weightedRisk = 0;

  for (const h of holdings) {
    const value = h.quantity * h.currentPrice;
    const pct = totalValue > 0 ? value / totalValue : 0; // fraction 0..1
    allocations[h.symbol] = +(pct * 100).toFixed(2);
    const sector = h.sector ?? 'UNCATEGORIZED';
    sectorFractions[sector] = (sectorFractions[sector] ?? 0) + pct;
    // Default risk weight: 0.5 baseline if unspecified.
    weightedRisk += pct * (h.riskWeight ?? 0.5);
  }
  for (const [sector, frac] of Object.entries(sectorFractions)) {
    sectorAllocations[sector] = +(frac * 100).toFixed(2);
  }

  const riskExposure = +(weightedRisk * 100).toFixed(2); // 0..100

  // Naive rebalancing: trim over-concentrated names, flag dust to consolidate.
  const rebalancing: PortfolioComputation['rebalancing'] = [];
  const riskWarnings: string[] = [];
  for (const h of holdings) {
    const value = h.quantity * h.currentPrice;
    const pct = totalValue > 0 ? value / totalValue : 0;
    if (pct > MAX_CONCENTRATION) {
      rebalancing.push({
        symbol: h.symbol,
        action: 'TRIM',
        reason: `${(pct * 100).toFixed(1)}% concentration exceeds ${(MAX_CONCENTRATION * 100).toFixed(0)}% target.`,
      });
      riskWarnings.push(`Over-concentrated in ${h.symbol} (${(pct * 100).toFixed(1)}%).`);
    } else if (pct > 0 && pct < MIN_MEANINGFUL) {
      rebalancing.push({
        symbol: h.symbol,
        action: 'ADD',
        reason: `Dust position (${(pct * 100).toFixed(2)}%) — consolidate or exit.`,
      });
    }
  }
  if (riskExposure > 70) {
    riskWarnings.push(`High aggregate risk exposure (${riskExposure}/100).`);
  }
  if (holdings.length > 0 && holdings.length < 3) {
    riskWarnings.push('Low diversification — fewer than 3 positions.');
  }

  return {
    totalValue: +totalValue.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    totalPnl: +totalPnl.toFixed(2),
    totalPnlPercent: +totalPnlPercent.toFixed(2),
    riskExposure,
    allocations,
    sectorAllocations,
    rebalancing,
    riskWarnings,
  };
}

/** Read holdings out of a stored allocations JSON blob. */
function holdingsFromRow(allocations: unknown): Holding[] {
  if (allocations && typeof allocations === 'object' && 'holdings' in allocations) {
    const raw = (allocations as { holdings?: unknown }).holdings;
    const parsed = z.array(holdingSchema).safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return [];
}

/**
 * GET  /api/portfolio          — lists the user's portfolios with computed PnL/risk/allocations.
 * POST /api/portfolio          — body {name, description?, holdings[]} creates a portfolio.
 * PUT  /api/portfolio          — body {id, holdings[], name?, description?} updates holdings.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  const userId = req.user.id;

  if (req.method === 'GET') {
    try {
      const rows = await prisma.portfolio.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const data = rows.map((p) => {
        const holdings = holdingsFromRow(p.allocations);
        return { id: p.id, name: p.name, description: p.description, holdings, ...computePortfolio(holdings) };
      });
      return res.status(200).json({ data });
    } catch {
      return res.status(200).json({ data: [], degraded: true });
    }
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }
    const { name, description, holdings } = parsed.data;
    const computed = computePortfolio(holdings);
    try {
      const portfolio = await prisma.portfolio.create({
        data: {
          userId,
          name,
          description,
          totalValue: computed.totalValue,
          totalPnl: computed.totalPnl,
          totalPnlPercent: computed.totalPnlPercent,
          riskExposure: computed.riskExposure,
          allocations: { holdings, allocations: computed.allocations } as object,
        },
      });
      return res.status(201).json({ data: { id: portfolio.id, name, description, holdings, ...computed } });
    } catch {
      return res.status(500).json({ error: 'Failed to create portfolio' });
    }
  }

  if (req.method === 'PUT') {
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }
    const { id, name, description, holdings } = parsed.data;
    const computed = computePortfolio(holdings);
    try {
      // Scope update to the caller's own portfolio.
      const existing = await prisma.portfolio.findFirst({ where: { id, userId } });
      if (!existing) return res.status(404).json({ error: 'Portfolio not found' });

      const portfolio = await prisma.portfolio.update({
        where: { id },
        data: {
          ...(name != null ? { name } : {}),
          ...(description != null ? { description } : {}),
          totalValue: computed.totalValue,
          totalPnl: computed.totalPnl,
          totalPnlPercent: computed.totalPnlPercent,
          riskExposure: computed.riskExposure,
          allocations: { holdings, allocations: computed.allocations } as object,
        },
      });
      return res.status(200).json({
        data: { id: portfolio.id, name: portfolio.name, description: portfolio.description, holdings, ...computed },
      });
    } catch {
      return res.status(500).json({ error: 'Failed to update portfolio' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
