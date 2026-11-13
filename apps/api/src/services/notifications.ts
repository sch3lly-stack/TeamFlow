import type { NotificationType } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "../lib/logger";
import { emitToUser } from "../realtime";

export type NotificationInput = {
  organizationId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string | null;
};

/**
 * Creates notification records and pushes them to connected clients. The actor
 * is never notified about their own action.
 */
export async function notifyUsers(input: NotificationInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(
    (userId) => Boolean(userId) && userId !== input.actorId,
  );
  if (recipients.length === 0) return;

  try {
    const rows = await prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({
        organizationId: input.organizationId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      })),
    });

    for (const row of rows) {
      emitToUser(row.userId, "notification", row);
    }
  } catch (error) {
    logger.warn({ err: error }, "failed to create notifications");
  }
}
