import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "../lib/logger";
import { emitToOrg } from "../realtime";

export type ActivityInput = {
  organizationId: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string | null;
  taskId?: string | null;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Activity is a best-effort audit trail for humans; a logging failure must not
 * roll back the underlying mutation.
 */
export async function recordActivity(input: ActivityInput) {
  try {
    const activity = await prisma.activityLog.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
      include: {
        actor: { select: { id: true, name: true, avatarColor: true } },
        project: { select: { id: true, name: true, key: true } },
      },
    });

    emitToOrg(input.organizationId, "activity:created", activity);
    return activity;
  } catch (error) {
    logger.warn({ err: error, action: input.action }, "failed to record activity");
    return null;
  }
}
