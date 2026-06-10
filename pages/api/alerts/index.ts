import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { featureEnabled } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { publishWs } from '@/lib/ws/hub';

const ALERT_TYPES = [
  'WHALE_BUY',
  'WHALE_SELL',
  'SMART_MONEY_ENTRY',
  'SMART_MONEY_EXIT',
  'FUNDING_EXTREME',
  'OI_SPIKE',
  'LIQUIDATION_ZONE',
  'SENTIMENT_EXPLOSION',
  'TREND_SHIFT',
  'CUSTOM',
] as const;

const ALERT_CHANNELS = ['TELEGRAM', 'DISCORD', 'EMAIL', 'IN_APP'] as const;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const createAlertSchema = z.object({
  type: z.enum(ALERT_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  severity: z.number().int().min(1).max(10).default(5),
  triggerConditions: z.record(z.any()),
  channels: z.array(z.enum(ALERT_CHANNELS)).default(['IN_APP']),
});

/**
 * GET  /api/alerts?limit= — lists the caller's alerts with recent history.
 * POST /api/alerts        — body {type, title, description, severity?, triggerConditions, channels?}.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  const userId = req.user.id;

  if (!featureEnabled('ENABLE_ALERTS')) {
    return res.status(503).json({ error: 'Alerts are disabled' });
  }

  if (req.method === 'GET') {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
    }
    try {
      const alerts = await prisma.alert.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit,
        include: { subscriptions: true, history: { take: 5, orderBy: { triggeredAt: 'desc' } } },
      });
      return res.status(200).json({ data: alerts });
    } catch {
      return res.status(200).json({ data: [], degraded: true });
    }
  }

  if (req.method === 'POST') {
    const parsed = createAlertSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }
    const data = parsed.data;

    try {
      const alert = await prisma.alert.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          description: data.description,
          severity: data.severity,
          triggerConditions: data.triggerConditions,
        },
      });

      if (data.channels.length > 0) {
        await prisma.alertSubscription.create({
          data: {
            userId,
            alertId: alert.id,
            channels: [...data.channels],
          },
        });
      }

      await audit({
        userId,
        action: 'ALERT_CREATE',
        resourceType: 'Alert',
        resourceId: alert.id,
        changes: { type: data.type, title: data.title },
      });

      // Notify any live dashboard sessions on the alerts channel.
      publishWs('alerts', 'alert_created', alert);

      return res.status(201).json({ data: alert });
    } catch {
      return res.status(500).json({ error: 'Failed to create alert' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
