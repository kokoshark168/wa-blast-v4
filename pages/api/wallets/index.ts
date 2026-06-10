import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

const EXCHANGE_TYPES = ['BINANCE', 'BYBIT', 'HYPERLIQUID', 'OTHER'] as const;
const CHAIN_TYPES = ['ethereum', 'solana', 'bsc', 'arbitrum', 'base'] as const;

const createWalletSchema = z.object({
  address: z.string().min(1).max(128),
  name: z.string().min(1).max(100),
  chainType: z.enum(CHAIN_TYPES).default('ethereum'),
  exchangeType: z.enum(EXCHANGE_TYPES).optional(),
});

/**
 * GET  /api/wallets — lists the caller's wallets with holdings.
 * POST /api/wallets — body {address, name, chainType?, exchangeType?}.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  const userId = req.user.id;

  if (req.method === 'GET') {
    try {
      const wallets = await prisma.wallet.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { holdings: true },
      });
      return res.status(200).json({ data: wallets });
    } catch {
      return res.status(200).json({ data: [], degraded: true });
    }
  }

  if (req.method === 'POST') {
    const parsed = createWalletSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }
    const data = parsed.data;

    try {
      const wallet = await prisma.wallet.create({
        data: {
          userId,
          address: data.address.toLowerCase(),
          name: data.name,
          chainType: data.chainType,
          exchangeType: data.exchangeType,
        },
      });

      await audit({
        userId,
        action: 'WALLET_ADD',
        resourceType: 'Wallet',
        resourceId: wallet.id,
        changes: { address: wallet.address, chainType: wallet.chainType },
      });

      return res.status(201).json({ data: wallet });
    } catch (error) {
      // Unique constraint (userId, address) — wallet already tracked.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: 'Wallet already added' });
      }
      return res.status(500).json({ error: 'Failed to add wallet' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
