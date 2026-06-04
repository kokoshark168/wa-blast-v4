import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken } from '@/lib/auth/jwt';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createWalletSchema = z.object({
  address: z.string(),
  name: z.string(),
  chainType: z.string().default('ethereum'),
  exchangeType: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verifyToken(token);
    const userId = payload.userId as string;

    if (req.method === 'GET') {
      const wallets = await prisma.wallet.findMany({
        where: { userId },
        include: { holdings: true },
      });
      return res.status(200).json({ wallets });
    }

    if (req.method === 'POST') {
      const data = createWalletSchema.parse(req.body);

      const wallet = await prisma.wallet.create({
        data: {
          userId,
          address: data.address.toLowerCase(),
          name: data.name,
          chainType: data.chainType,
          exchangeType: data.exchangeType,
        },
      });

      return res.status(201).json({ wallet });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
