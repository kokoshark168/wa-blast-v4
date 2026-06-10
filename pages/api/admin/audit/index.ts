import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import type { Prisma, AuditAction } from '@prisma/client';

const AUDIT_ACTIONS = [
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'WALLET_ADD',
  'WALLET_REMOVE',
  'ALERT_CREATE',
  'ALERT_TRIGGER',
  'SUBSCRIPTION_CHANGE',
  'SETTINGS_UPDATE',
] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  action: z.enum(AUDIT_ACTIONS).optional(),
  userId: z.string().optional(),
});

/**
 * GET /api/admin/audit?page&pageSize&action&userId — paginated audit log list.
 * Admin-only.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { page, pageSize, action, userId } = parsed.data;

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: action as AuditAction } : {}),
    ...(userId ? { userId } : {}),
  };

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, email: true, username: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return res.status(200).json({
      data: { logs, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch {
    return res.status(500).json({ error: 'Failed to list audit logs' });
  }
}

export default withAuth(handler, ['ADMIN']);
