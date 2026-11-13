import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../db";
import { logger } from "../lib/logger";

export type AuditInput = {
  action: string;
  organizationId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Security-relevant audit trail (logins, role changes, deletions, exports).
 * Failures are logged but never break the user-facing operation.
 */
export async function recordAudit(req: Request, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId:
          input.organizationId ??
          req.organizationId ??
          req.membership?.organizationId ??
          null,
        actorId: req.user?.id ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ip: req.ip?.slice(0, 90),
        userAgent: req.get("user-agent")?.slice(0, 400),
        metadata: input.metadata,
      },
    });
  } catch (error) {
    logger.warn({ err: error, action: input.action }, "failed to write audit log");
  }
}
