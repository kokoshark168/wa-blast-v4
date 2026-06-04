import type { NextApiResponse } from 'next';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { dataSourceHealth, type DataSourceHealth } from '@/services/index';

/**
 * GET /api/admin/stats — Admin-only platform overview:
 * entity counts, live data-source health, and the most recent audit log entries.
 * Each section degrades independently so one failure doesn't sink the response.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let degraded = false;

  // Entity counts.
  let counts = { users: 0, wallets: 0, alerts: 0, transactions: 0 };
  try {
    const [users, wallets, alerts, transactions] = await Promise.all([
      prisma.user.count(),
      prisma.wallet.count(),
      prisma.alert.count(),
      prisma.transaction.count(),
    ]);
    counts = { users, wallets, alerts, transactions };
  } catch {
    degraded = true;
  }

  // Data-source health.
  let health: DataSourceHealth[] = [];
  try {
    health = await dataSourceHealth();
  } catch {
    degraded = true;
  }

  // Recent audit logs.
  let recentAuditLogs: unknown[] = [];
  try {
    recentAuditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { id: true, email: true, username: true } } },
    });
  } catch {
    degraded = true;
  }

  return res.status(200).json({
    data: { counts, dataSourceHealth: health, recentAuditLogs },
    ...(degraded ? { degraded: true } : {}),
  });
}

export default withAuth(handler, ['ADMIN']);
