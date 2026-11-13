import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors";
import { authenticate } from "../middleware/auth";
import { recordAudit } from "../services/audit";
import { notifyUsers } from "../services/notifications";

export const invitationsRouter = Router();

invitationsRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: {
        organization: { select: { id: true, name: true, slug: true, logoColor: true } },
        invitedBy: { select: { id: true, name: true } },
      },
    });
    if (!invitation) throw notFound("Invitation not found");

    const expired = invitation.expiresAt.getTime() < Date.now();
    const status =
      invitation.status === "PENDING" && expired ? "EXPIRED" : invitation.status;

    res.json({
      invitation: {
        email: invitation.email,
        role: invitation.role,
        status,
        expiresAt: invitation.expiresAt,
        organization: invitation.organization,
        invitedBy: invitation.invitedBy,
      },
    });
  }),
);

invitationsRouter.post(
  "/:token/accept",
  authenticate,
  asyncHandler(async (req, res) => {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: {
        organization: { select: { id: true, name: true, slug: true, logoColor: true } },
      },
    });
    if (!invitation) throw notFound("Invitation not found");

    if (invitation.status !== "PENDING") {
      throw badRequest("This invitation is no longer valid");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw badRequest("This invitation has expired");
    }
    if (invitation.email.toLowerCase() !== req.user!.email.toLowerCase()) {
      throw forbidden("This invitation was issued to a different email address");
    }

    const membership = await prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user!.id,
            organizationId: invitation.organizationId,
          },
        },
      });

      const created =
        existing ??
        (await tx.membership.create({
          data: {
            userId: req.user!.id,
            organizationId: invitation.organizationId,
            role: invitation.role,
          },
        }));

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      return created;
    });

    req.organizationId = invitation.organizationId;
    await recordAudit(req, {
      action: "invitation.accepted",
      organizationId: invitation.organizationId,
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: { role: invitation.role },
    });

    if (invitation.invitedById) {
      await notifyUsers({
        organizationId: invitation.organizationId,
        userIds: [invitation.invitedById],
        type: "INVITATION",
        title: "Invitation accepted",
        body: `${req.user!.name} joined ${invitation.organization.name}.`,
        entityType: "Membership",
        entityId: membership.id,
        actorId: req.user!.id,
      });
    }

    res.json({
      organization: invitation.organization,
      membership: {
        id: membership.id,
        role: membership.role,
        organizationId: membership.organizationId,
      },
    });
  }),
);
