import type { NextApiRequest, NextApiResponse } from 'next';
import { hashPassword } from '@/lib/auth/crypto';
import { signToken } from '@/lib/auth/jwt';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(8),
});

type RegisterRequest = z.infer<typeof registerSchema>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
      },
    });

    const token = signToken({ userId: user.id, email: user.email });

    await audit({
      userId: user.id,
      action: 'USER_CREATE',
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || undefined,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({ token, user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
