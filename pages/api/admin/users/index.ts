import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import type { Prisma, UserRole, SubscriptionTier } from '@prisma/client';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['ADMIN', 'TRADER', 'SUBSCRIBER_PRO', 'SUBSCRIBER_ELITE', 'SUBSCRIBER_BASIC']).optional(),
  subscriptionTier: z.enum(['FREE', 'BASIC', 'PRO', 'ELITE']).optional(),
  isActive: z.boolean().optional(),
});

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  subscriptionTier: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/**
 * GET /api/admin/users?page&pageSize&search — paginated user list.
 * PUT /api/admin/users — body {id, role?, subscriptionTier?, isActive?}; audits each change.
 * Admin-only.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
    }
    const { page, pageSize, search } = parsed.data;
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    try {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: USER_SELECT,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.user.count({ where }),
      ]);
      return res.status(200).json({
        data: { users, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch {
      return res.status(500).json({ error: 'Failed to list users' });
    }
  }

  if (req.method === 'PUT') {
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }
    const { id, role, subscriptionTier, isActive } = parsed.data;

    try {
      const before = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
      if (!before) return res.status(404).json({ error: 'User not found' });

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(role != null ? { role: role as UserRole } : {}),
          ...(subscriptionTier != null ? { subscriptionTier: subscriptionTier as SubscriptionTier } : {}),
          ...(isActive != null ? { isActive } : {}),
        },
        select: USER_SELECT,
      });

      // Record exactly what changed for the audit trail.
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (role != null && role !== before.role) changes.role = { from: before.role, to: role };
      if (subscriptionTier != null && subscriptionTier !== before.subscriptionTier) {
        changes.subscriptionTier = { from: before.subscriptionTier, to: subscriptionTier };
      }
      if (isActive != null && isActive !== before.isActive) {
        changes.isActive = { from: before.isActive, to: isActive };
      }

      await audit({
        userId: req.user.id,
        action: 'USER_UPDATE',
        resourceType: 'User',
        resourceId: id,
        changes,
      });

      return res.status(200).json({ data: updated });
    } catch {
      return res.status(500).json({ error: 'Failed to update user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler, ['ADMIN']);
