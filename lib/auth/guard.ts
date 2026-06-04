import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken, type TokenPayload } from './jwt';
import { prisma } from '@/lib/prisma';

export interface AuthedRequest extends NextApiRequest {
  user: { id: string; email: string; role: string };
}

type Handler = (req: AuthedRequest, res: NextApiResponse) => Promise<void> | void;

/**
 * Wraps an API handler to require a valid bearer token. Attaches `req.user`.
 * Optionally enforce one of the allowed roles (e.g. ['ADMIN']).
 */
export function withAuth(handler: Handler, allowedRoles?: string[]) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account not found or inactive' });
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    (req as AuthedRequest).user = { id: user.id, email: user.email, role: user.role };
    return handler(req as AuthedRequest, res);
  };
}
