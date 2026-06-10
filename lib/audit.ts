import { prisma } from './prisma';
import { logger } from './logger';
import type { AuditAction } from '@prisma/client';

interface AuditParams {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** Persist an audit log entry. Never throws into the request path. */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        changes: (params.changes ?? {}) as object,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.error({ err }, 'failed to write audit log');
  }
}
