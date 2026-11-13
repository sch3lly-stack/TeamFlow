import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, notFound } from "../lib/errors";
import { authenticate } from "../middleware/auth";
import { parseQuery } from "../middleware/validate";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const notificationQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseQuery(notificationQuerySchema, req.query);
    const unreadOnly = query.unreadOnly === "true";

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id, ...(unreadOnly ? { readAt: null } : {}) },
        include: {
          organization: { select: { id: true, name: true, logoColor: true } },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);

    res.json({ notifications, unreadCount });
  }),
);

notificationsRouter.patch(
  "/:notificationId/read",
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.notificationId, userId: req.user!.id },
    });
    if (!notification) throw notFound("Notification not found");

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    res.json({ notification: updated });
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: result.count });
  }),
);

notificationsRouter.delete(
  "/:notificationId",
  asyncHandler(async (req, res) => {
    await prisma.notification.deleteMany({
      where: { id: req.params.notificationId, userId: req.user!.id },
    });
    res.status(204).send();
  }),
);
