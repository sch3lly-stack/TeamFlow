import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { assignableRoles } from "../domain/permissions";
import { env } from "../env";
import { asyncHandler, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { generateOpaqueToken } from "../lib/tokens";
import { authenticate } from "../middleware/auth";
import { requireCapability, requireOrg } from "../middleware/org";
import { parseBody } from "../middleware/validate";
import { recordActivity } from "../services/activity";
import { recordAudit } from "../services/audit";
import { notifyUsers } from "../services/notifications";

export const peopleRouter = Router();

peopleRouter.use(authenticate);
peopleRouter.use("/:orgId", requireOrg);

const orgRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "PROJECT_MANAGER",
  "TEAM_LEAD",
  "DEVELOPER",
  "VIEWER",
]);

const updateMemberSchema = z
  .object({
    role: orgRoleSchema.optional(),
    title: z.string().trim().max(80).nullable().optional(),
    departmentId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided");

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "DEVELOPER", "VIEWER"]).default("DEVELOPER"),
});

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  leadId: z.string().min(1).nullable().optional(),
});

const teamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  leadId: z.string().min(1).nullable().optional(),
});

const teamMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["LEAD", "MEMBER"]).default("MEMBER"),
});

function assertCanManageTeam(req: Request, team: { leadId: string | null }): void {
  if (req.membership!.role === "TEAM_LEAD" && team.leadId !== req.user!.id) {
    throw forbidden("Team leads can only manage the teams they lead");
  }
}

async function assertOrgUser(organizationId: string, userId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true },
  });
  if (!membership) throw badRequest("That user is not a member of this organization");
}

peopleRouter.get(
  "/:orgId/members",
  asyncHandler(async (req, res) => {
    const members = await prisma.membership.findMany({
      where: { organizationId: req.organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarColor: true,
            timezone: true,
          },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    res.json({
      members: members.map((membership) => ({
        id: membership.id,
        role: membership.role,
        title: membership.title,
        department: membership.department,
        user: membership.user,
        createdAt: membership.createdAt,
        isSelf: membership.userId === req.user!.id,
      })),
    });
  }),
);

peopleRouter.patch(
  "/:orgId/members/:membershipId",
  requireCapability("members:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateMemberSchema, req.body);

    const target = await prisma.membership.findFirst({
      where: { id: req.params.membershipId, organizationId: req.organizationId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!target) throw notFound("Member not found");

    const actorRole = req.membership!.role;

    if (target.role === "OWNER" && actorRole !== "OWNER") {
      throw forbidden("Only an owner can manage another owner");
    }

    if (input.role && input.role !== target.role) {
      if (!assignableRoles(actorRole).includes(input.role)) {
        throw forbidden("You cannot assign that role");
      }
      if (target.role === "OWNER" && input.role !== "OWNER") {
        const ownerCount = await prisma.membership.count({
          where: { organizationId: req.organizationId, role: "OWNER" },
        });
        if (ownerCount <= 1) throw badRequest("The organization must retain at least one owner");
      }
    }

    if (target.role === "OWNER" && input.role === undefined) {
      // Title/department changes on an owner by an owner are allowed.
    }

    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!department) throw badRequest("Department not found in this organization");
    }

    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
        department: { select: { id: true, name: true } },
      },
    });

    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "member.updated",
      entityType: "Membership",
      entityId: updated.id,
      metadata: {
        member: target.user.name,
        role: updated.role,
        changes: Object.keys(input),
      },
    });
    await recordAudit(req, {
      action: "member.role_updated",
      entityType: "Membership",
      entityId: updated.id,
      metadata: { before: target.role, after: updated.role, userId: target.userId },
    });

    res.json({ member: updated });
  }),
);

peopleRouter.delete(
  "/:orgId/members/:membershipId",
  requireCapability("members:manage"),
  asyncHandler(async (req, res) => {
    const target = await prisma.membership.findFirst({
      where: { id: req.params.membershipId, organizationId: req.organizationId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!target) throw notFound("Member not found");

    if (target.role === "OWNER") {
      if (req.membership!.role !== "OWNER") {
        throw forbidden("Only an owner can remove another owner");
      }
      const ownerCount = await prisma.membership.count({
        where: { organizationId: req.organizationId, role: "OWNER" },
      });
      if (ownerCount <= 1) throw badRequest("The organization must retain at least one owner");
    }

    const organizationId = req.organizationId!;
    const userId = target.userId;

    await prisma.$transaction([
      prisma.taskAssignment.deleteMany({
        where: { userId, task: { organizationId } },
      }),
      prisma.projectMember.deleteMany({
        where: { userId, project: { organizationId } },
      }),
      prisma.teamMember.deleteMany({
        where: { userId, team: { organizationId } },
      }),
      prisma.notification.deleteMany({ where: { userId, organizationId } }),
      prisma.membership.delete({ where: { id: target.id } }),
    ]);

    await recordActivity({
      organizationId,
      actorId: req.user!.id,
      action: "member.removed",
      entityType: "Membership",
      entityId: target.id,
      metadata: { member: target.user.name },
    });
    await recordAudit(req, {
      action: "member.removed",
      entityType: "Membership",
      entityId: target.id,
      metadata: { userId, role: target.role },
    });

    res.status(204).send();
  }),
);

peopleRouter.get(
  "/:orgId/invitations",
  requireCapability("members:manage"),
  asyncHandler(async (req, res) => {
    const invitations = await prisma.invitation.findMany({
      where: { organizationId: req.organizationId },
      include: { invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ invitations });
  }),
);

peopleRouter.post(
  "/:orgId/invitations",
  requireCapability("members:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(inviteSchema, req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true },
    });

    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId: req.organizationId!,
          },
        },
      });
      if (existingMembership) throw conflict("That person is already a member");
    }

    await prisma.invitation.updateMany({
      where: {
        organizationId: req.organizationId,
        email: input.email,
        status: "PENDING",
      },
      data: { status: "REVOKED" },
    });

    const token = generateOpaqueToken(24);
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: req.organizationId!,
        email: input.email,
        role: input.role,
        token,
        invitedById: req.user!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      include: { invitedBy: { select: { id: true, name: true } } },
    });

    const inviteUrl = `${env.clientOrigins[0] ?? "http://localhost:5173"}/invite/${token}`;

    if (existingUser) {
      await notifyUsers({
        organizationId: req.organizationId!,
        userIds: [existingUser.id],
        type: "INVITATION",
        title: "You have a new organization invitation",
        body: `${req.user!.name} invited you to join as ${input.role.toLowerCase().replace("_", " ")}.`,
        entityType: "Invitation",
        entityId: invitation.id,
        actorId: req.user!.id,
      });
    }

    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "invitation.created",
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: { email: input.email, role: input.role },
    });
    await recordAudit(req, {
      action: "invitation.created",
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: { email: input.email, role: input.role },
    });

    res.status(201).json({ invitation, inviteUrl });
  }),
);

peopleRouter.delete(
  "/:orgId/invitations/:invitationId",
  requireCapability("members:manage"),
  asyncHandler(async (req, res) => {
    const invitation = await prisma.invitation.findFirst({
      where: { id: req.params.invitationId, organizationId: req.organizationId },
    });
    if (!invitation) throw notFound("Invitation not found");
    if (invitation.status !== "PENDING") throw badRequest("Invitation is no longer pending");

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
    await recordAudit(req, {
      action: "invitation.revoked",
      entityType: "Invitation",
      entityId: invitation.id,
    });

    res.status(204).send();
  }),
);

peopleRouter.get(
  "/:orgId/departments",
  asyncHandler(async (req, res) => {
    const departments = await prisma.department.findMany({
      where: { organizationId: req.organizationId },
      include: {
        lead: { select: { id: true, name: true, avatarColor: true } },
        _count: { select: { teams: true, members: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ departments });
  }),
);

peopleRouter.post(
  "/:orgId/departments",
  requireCapability("structure:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(departmentSchema, req.body);
    if (input.leadId) await assertOrgUser(req.organizationId!, input.leadId);

    const department = await prisma.department.create({
      data: {
        organizationId: req.organizationId!,
        name: input.name,
        description: input.description,
        leadId: input.leadId,
      },
      include: { lead: { select: { id: true, name: true, avatarColor: true } } },
    });

    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "department.created",
      entityType: "Department",
      entityId: department.id,
      metadata: { name: department.name },
    });
    await recordAudit(req, {
      action: "department.created",
      entityType: "Department",
      entityId: department.id,
    });

    res.status(201).json({ department });
  }),
);

peopleRouter.patch(
  "/:orgId/departments/:departmentId",
  requireCapability("structure:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(departmentSchema.partial(), req.body);
    const existing = await prisma.department.findFirst({
      where: { id: req.params.departmentId, organizationId: req.organizationId },
    });
    if (!existing) throw notFound("Department not found");
    if (input.leadId) await assertOrgUser(req.organizationId!, input.leadId);

    const department = await prisma.department.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      },
      include: { lead: { select: { id: true, name: true, avatarColor: true } } },
    });
    await recordAudit(req, {
      action: "department.updated",
      entityType: "Department",
      entityId: department.id,
    });
    res.json({ department });
  }),
);

peopleRouter.delete(
  "/:orgId/departments/:departmentId",
  requireCapability("structure:manage"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.department.findFirst({
      where: { id: req.params.departmentId, organizationId: req.organizationId },
    });
    if (!existing) throw notFound("Department not found");
    await prisma.department.delete({ where: { id: existing.id } });
    await recordAudit(req, {
      action: "department.deleted",
      entityType: "Department",
      entityId: existing.id,
      metadata: { name: existing.name },
    });
    res.status(204).send();
  }),
);

peopleRouter.get(
  "/:orgId/teams",
  asyncHandler(async (req, res) => {
    const teams = await prisma.team.findMany({
      where: { organizationId: req.organizationId },
      include: {
        department: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, avatarColor: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarColor: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        _count: { select: { projects: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ teams });
  }),
);

peopleRouter.post(
  "/:orgId/teams",
  requireCapability("team:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(teamSchema, req.body);
    if (input.leadId) await assertOrgUser(req.organizationId!, input.leadId);
    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!department) throw badRequest("Department not found");
    }

    const team = await prisma.team.create({
      data: {
        organizationId: req.organizationId!,
        name: input.name,
        description: input.description,
        departmentId: input.departmentId,
        leadId: input.leadId,
        ...(input.leadId
          ? {
              members: {
                create: { userId: input.leadId, role: "LEAD" },
              },
            }
          : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, avatarColor: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatarColor: true } } },
        },
      },
    });

    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "team.created",
      entityType: "Team",
      entityId: team.id,
      metadata: { name: team.name },
    });
    await recordAudit(req, { action: "team.created", entityType: "Team", entityId: team.id });

    res.status(201).json({ team });
  }),
);

peopleRouter.patch(
  "/:orgId/teams/:teamId",
  requireCapability("team:manage"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.team.findFirst({
      where: { id: req.params.teamId, organizationId: req.organizationId },
    });
    if (!existing) throw notFound("Team not found");
    assertCanManageTeam(req, existing);

    const input = parseBody(teamSchema.partial(), req.body);
    if (input.leadId) await assertOrgUser(req.organizationId!, input.leadId);
    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!department) throw badRequest("Department not found");
    }

    const team = await prisma.team.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, avatarColor: true } },
      },
    });
    await recordAudit(req, { action: "team.updated", entityType: "Team", entityId: team.id });
    res.json({ team });
  }),
);

peopleRouter.delete(
  "/:orgId/teams/:teamId",
  requireCapability("team:manage"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.team.findFirst({
      where: { id: req.params.teamId, organizationId: req.organizationId },
    });
    if (!existing) throw notFound("Team not found");
    assertCanManageTeam(req, existing);
    await prisma.team.delete({ where: { id: existing.id } });
    await recordAudit(req, {
      action: "team.deleted",
      entityType: "Team",
      entityId: existing.id,
      metadata: { name: existing.name },
    });
    res.status(204).send();
  }),
);

peopleRouter.post(
  "/:orgId/teams/:teamId/members",
  requireCapability("team:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(teamMemberSchema, req.body);
    const team = await prisma.team.findFirst({
      where: { id: req.params.teamId, organizationId: req.organizationId },
    });
    if (!team) throw notFound("Team not found");
    assertCanManageTeam(req, team);
    await assertOrgUser(req.organizationId!, input.userId);

    const member = await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: input.userId } },
      update: { role: input.role },
      create: { teamId: team.id, userId: input.userId, role: input.role },
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    });

    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "team.member_added",
      entityType: "Team",
      entityId: team.id,
      metadata: { team: team.name, member: member.user.name },
    });

    res.status(201).json({ member });
  }),
);

peopleRouter.delete(
  "/:orgId/teams/:teamId/members/:userId",
  requireCapability("team:manage"),
  asyncHandler(async (req, res) => {
    const team = await prisma.team.findFirst({
      where: { id: req.params.teamId, organizationId: req.organizationId },
    });
    if (!team) throw notFound("Team not found");
    assertCanManageTeam(req, team);

    await prisma.teamMember.deleteMany({
      where: { teamId: team.id, userId: req.params.userId },
    });
    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "team.member_removed",
      entityType: "Team",
      entityId: team.id,
      metadata: { team: team.name },
    });
    res.status(204).send();
  }),
);
