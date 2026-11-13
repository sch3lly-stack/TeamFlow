import { unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { prisma } from "../db";
import { isOrgAdmin } from "../domain/permissions";
import { env } from "../env";
import { asyncHandler, forbidden, notFound } from "../lib/errors";
import { authenticate } from "../middleware/auth";
import { emitToOrg } from "../realtime";
import { getProjectContext, requireProjectCapability } from "../services/access";
import { recordActivity } from "../services/activity";

export const attachmentsRouter = Router();
attachmentsRouter.use(authenticate);

async function loadAttachment(userId: string, attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      task: { select: { id: true, projectId: true, title: true } },
    },
  });
  if (!attachment) throw notFound("Attachment not found");

  const context = await getProjectContext(userId, attachment.task.projectId);
  if (context.project.organizationId !== attachment.organizationId) {
    throw notFound("Attachment not found");
  }
  return { attachment, context };
}

attachmentsRouter.get(
  "/:attachmentId/download",
  asyncHandler(async (req, res, next) => {
    const { attachment } = await loadAttachment(req.user!.id, req.params.attachmentId);
    const filePath = path.join(env.uploadDir, path.basename(attachment.storageKey));

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/octet-stream");
    res.download(filePath, attachment.filename, (error) => {
      if (error) {
        if (res.headersSent) return;
        next(notFound("The stored file could not be found"));
      }
    });
  }),
);

attachmentsRouter.delete(
  "/:attachmentId",
  asyncHandler(async (req, res) => {
    const { attachment, context } = await loadAttachment(
      req.user!.id,
      req.params.attachmentId,
    );

    const canDelete =
      attachment.uploaderId === req.user!.id ||
      isOrgAdmin(context.membership.role) ||
      context.capabilities.has("task:delete");

    if (!canDelete) throw forbidden("You cannot delete this attachment");

    await prisma.attachment.delete({ where: { id: attachment.id } });
    await unlink(path.join(env.uploadDir, path.basename(attachment.storageKey))).catch(
      () => undefined,
    );

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      taskId: attachment.task.id,
      actorId: req.user!.id,
      action: "attachment.deleted",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { filename: attachment.filename },
    });
    emitToOrg(context.project.organizationId, "attachment:deleted", {
      taskId: attachment.task.id,
      projectId: context.project.id,
      attachmentId: attachment.id,
    });

    res.status(204).send();
  }),
);
