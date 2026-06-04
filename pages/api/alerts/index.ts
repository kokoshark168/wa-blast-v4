import type { NextApiRequest, NextApiResponse } from 'next';
import type { AlertType } from '@prisma/client';
import { verifyToken } from '@/lib/auth/jwt';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createAlertSchema = z.object({
  type: z.string(),
  title: z.string(),
  description: z.string(),
  triggerConditions: z.record(z.any()),
  channels: z.array(z.string()).default(['IN_APP']),
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
      const alerts = await prisma.alert.findMany({
        where: { userId },
        include: { subscriptions: true, history: { take: 5, orderBy: { triggeredAt: 'desc' } } },
      });
      return res.status(200).json({ alerts });
    }

    if (req.method === 'POST') {
      const data = createAlertSchema.parse(req.body);

      const alert = await prisma.alert.create({
        data: {
          userId,
          type: data.type as AlertType,
          title: data.title,
          description: data.description,
          triggerConditions: data.triggerConditions,
        },
      });

      if (data.channels.length > 0) {
        await prisma.alertSubscription.create({
          data: {
            userId,
            alertId: alert.id,
            channels: data.channels as any,
          },
        });
      }

      return res.status(201).json({ alert });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
