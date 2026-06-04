import type { NextApiResponse } from 'next';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { dataSourceHealth } from '@/services';

/**
 * GET /api/datasources/health
 * Returns the health/configuration status of every external data source.
 * Degrades to an empty map if the health probe itself fails.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const health = await dataSourceHealth();
    return res.status(200).json({ data: health });
  } catch {
    return res.status(200).json({ data: [], degraded: true });
  }
}

export default withAuth(handler);
