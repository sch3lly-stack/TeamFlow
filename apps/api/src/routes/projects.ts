import { Priority, ProjectStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { DEFAULT_PROJECT_COLUMNS } from "../domain/defaults";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/errors";
import { toCsv } from "../lib/csv";
import { authenticate } from "../middleware/auth";
import { requireCapability, requireOrg } from "../middleware/org";
import { parseBody, parseQuery } from "../middleware/validate";
import { emitToOrg } from "../realtime";
import {
  getProjectContext,
  requireProjectCapability,
} from "../services/access";
import { recordActivity } from "../services/activity";
import { getProjectAnalytics } from "../services/analytics";
import { recordAudit } from "../services/audit";
import { notifyUsers } from "../services/notifications";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color");

const projectCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(8)
      .regex(/^[A-Z][A-Z0-9]*$/, "Use 2-8 letters or numbers, starting with a letter"),
    description: z.string().trim().max(2000).optional(),
    objectives: z.string().trim().max(2000).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    priority: z.nativeEnum(Priority).optional(),
    color: hexColor.optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    ownerId: z.string().min(1).optional(),
    teamId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      !value.startDate || !value.dueDate || value.startDate <= value.dueDate,
    { message: "The project start date must be before its deadline", path: ["dueDate"] },
  );

const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(8)
      .regex(/^[A-Z][A-Z0-9]*$/)
      .optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    objectives: z.string().trim().max(2000).nullable().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    priority: z.nativeEnum(Priority).optional(),
    color: hexColor.optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    ownerId: z.string().min(1).optional(),
    teamId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided");

const projectListQuerySchema = z.object({
  status: z.nativeEnum(ProjectStatus).optional(),
  q: z.string().trim().max(80).optional(),
  teamId: z.string().min(1).optional(),
});

const projectMembersQuerySchema = z.object({});

const memberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["MANAGER", "CONTRIBUTOR", "VIEWER"]).default("CONTRIBUTOR"),
});

const columnSchema = z.object({
  name: z.string().trim().min(1).max(40),
  position: z.coerce.number().int().min(0).max(1000).optional(),
  isDone: z.boolean().optional(),
  wipLimit: z.coerce.number().int().min(1).max(100).nullable().optional(),
});

const milestoneSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).nullable().optional(),
    dueDate: z.coerce.date(),
    status: z.enum(["PENDING", "AT_RISK", "COMPLETED"]).optional(),
  })
  .strict();

const reportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

async function assertOrgMember(organizationId: string, userId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true },
  });
  if (!membership) throw badRequest("That person is not a member of this organization");
}

/** Projects collection lives under organizations. */
export const orgProjectsRouter = Router();
orgProjectsRouter.use(authenticate);

orgProjectsRouter.get(
  "/:orgId/projects",
  requireOrg,
  asyncHandler(async (req, res) => {
    const query = parseQuery(projectListQuerySchema, req.query);

    const projects = await prisma.project.findMany({
      where: {
        organizationId: req.organizationId,
        archived: false,
        ...(query.status ? { status: query.status } : {}),
        ...(query.teamId ? { teamId: query.teamId } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { key: { contains: query.q, mode: "insensitive" } },
                { description: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        owner: { select: { id: true, name: true, avatarColor: true } },
        team: { select: { id: true, name: true } },
        _count: { select: { tasks: true, members: true, sprints: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });

    const projectIds = projects.map((project) => project.id);
    const tasks =
      projectIds.length === 0
        ? []
        : await prisma.task.findMany({
            where: { projectId: { in: projectIds }, archived: false },
            select: { projectId: true, column: { select: { isDone: true } } },
          });

    const stats = new Map<string, { total: number; completed: number }>();
    for (const task of tasks) {
      const entry = stats.get(task.projectId) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (task.column.isDone) entry.completed += 1;
      stats.set(task.projectId, entry);
    }

    res.json({
      projects: projects.map((project) => {
        const entry = stats.get(project.id) ?? { total: 0, completed: 0 };
        return {
          ...project,
          taskStats: {
            ...entry,
            progress:
              entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100),
          },
        };
      }),
    });
  }),
);

orgProjectsRouter.post(
  "/:orgId/projects",
  requireOrg,
  requireCapability("project:create"),
  asyncHandler(async (req, res) => {
    const input = parseBody(projectCreateSchema, req.body);

    const existingKey = await prisma.project.findUnique({
      where: { organizationId_key: { organizationId: req.organizationId!, key: input.key } },
      select: { id: true },
    });
    if (existingKey) throw conflict("That project key is already in use");

    const ownerId = input.ownerId ?? req.user!.id;
    await assertOrgMember(req.organizationId!, ownerId);

    if (input.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!team) throw badRequest("Team not found in this organization");
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organizationId: req.organizationId!,
          name: input.name,
          key: input.key,
          description: input.description,
          objectives: input.objectives,
          status: input.status ?? "PLANNING",
          priority: input.priority ?? "MEDIUM",
          color: input.color ?? "#6366f1",
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          ownerId,
          teamId: input.teamId ?? null,
        },
      });
      await tx.workflowColumn.createMany({
        data: DEFAULT_PROJECT_COLUMNS.map((column) => ({
          ...column,
          projectId: created.id,
        })),
      });
      await tx.projectMember.create({
        data: { projectId: created.id, userId: ownerId, role: "MANAGER" },
      });
      return tx.project.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          owner: { select: { id: true, name: true, avatarColor: true } },
          team: { select: { id: true, name: true } },
          columns: { orderBy: { position: "asc" } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, avatarColor: true } },
            },
          },
        },
      });
    });

    await recordActivity({
      organizationId: req.organizationId!,
      projectId: project.id,
      actorId: req.user!.id,
      action: "project.created",
      entityType: "Project",
      entityId: project.id,
      metadata: { name: project.name, key: project.key },
    });
    await recordAudit(req, {
      action: "project.created",
      entityType: "Project",
      entityId: project.id,
      metadata: { name: project.name, key: project.key },
    });
    emitToOrg(req.organizationId!, "project:created", project);

    res.status(201).json({ project });
  }),
);

/** Individual projects, workflow, members, milestones, and reports. */
export const projectsRouter = Router();
projectsRouter.use(authenticate);

projectsRouter.get(
  "/:projectId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);

    const [project, taskCounts] = await Promise.all([
      prisma.project.findUnique({
        where: { id: context.project.id },
        include: {
          owner: { select: { id: true, name: true, email: true, avatarColor: true } },
          team: { select: { id: true, name: true } },
          columns: { orderBy: { position: "asc" } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, avatarColor: true } },
            },
            orderBy: { addedAt: "asc" },
          },
          milestones: { orderBy: { dueDate: "asc" } },
          sprints: {
            orderBy: { startDate: "desc" },
            include: {
              tasks: {
                select: {
                  id: true,
                  storyPoints: true,
                  completedAt: true,
                  column: { select: { isDone: true } },
                },
              },
            },
          },
          _count: { select: { tasks: true, members: true } },
        },
      }),
      prisma.task.groupBy({
        by: ["columnId"],
        where: { projectId: context.project.id, archived: false },
        _count: { _all: true },
      }),
    ]);

    if (!project) throw notFound("Project not found");
    const countByColumn = new Map(
      taskCounts.map((row) => [row.columnId, row._count._all]),
    );

    const sprints = project.sprints.map((sprint) => {
      const completed = sprint.tasks.filter((task) => task.column.isDone).length;
      return {
        ...sprint,
        tasks: undefined,
        stats: {
          totalTasks: sprint.tasks.length,
          completedTasks: completed,
          progress:
            sprint.tasks.length === 0
              ? 0
              : Math.round((completed / sprint.tasks.length) * 100),
        },
      };
    });

    res.json({
      project: {
        ...project,
        sprints,
        columns: project.columns.map((column) => ({
          ...column,
          taskCount: countByColumn.get(column.id) ?? 0,
        })),
      },
      permissions: [...context.capabilities],
      projectRole: context.projectMember?.role ?? null,
      organizationRole: context.membership.role,
    });
  }),
);

projectsRouter.patch(
  "/:projectId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "project:manage");

    const input = parseBody(projectUpdateSchema, req.body);
    const projectId = context.project.id;

    if (input.key && input.key !== context.project.key) {
      const existingKey = await prisma.project.findUnique({
        where: {
          organizationId_key: {
            organizationId: context.project.organizationId,
            key: input.key,
          },
        },
        select: { id: true },
      });
      if (existingKey) throw conflict("That project key is already in use");
    }

    if (input.ownerId) {
      await assertOrgMember(context.project.organizationId, input.ownerId);
    }
    if (input.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, organizationId: context.project.organizationId },
        select: { id: true, name: true },
      });
      if (!team) throw badRequest("Team not found in this organization");
    }

    const startDate = input.startDate !== undefined ? input.startDate : context.project.startDate;
    const dueDate = input.dueDate !== undefined ? input.dueDate : context.project.dueDate;
    if (startDate && dueDate && startDate > dueDate) {
      throw badRequest("The project start date must be before its deadline");
    }

    const project = await prisma.$transaction(async (tx) => {
      if (input.ownerId && input.ownerId !== context.project.ownerId) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: input.ownerId } },
          update: { role: "MANAGER" },
          create: { projectId, userId: input.ownerId, role: "MANAGER" },
        });
      }

      return tx.project.update({
        where: { id: projectId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.key !== undefined ? { key: input.key } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.objectives !== undefined ? { objectives: input.objectives } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        },
        include: {
          owner: { select: { id: true, name: true, avatarColor: true } },
          team: { select: { id: true, name: true } },
          columns: { orderBy: { position: "asc" } },
        },
      });
    });

    if (input.ownerId && input.ownerId !== context.project.ownerId) {
      const projectWithName = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      await notifyUsers({
        organizationId: context.project.organizationId,
        userIds: [input.ownerId],
        type: "ADDED_TO_PROJECT",
        title: "You are now a project owner",
        body: `You own ${projectWithName?.name ?? "a project"}.`,
        entityType: "Project",
        entityId: projectId,
        actorId: req.user!.id,
      });
    }

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId,
      actorId: req.user!.id,
      action: "project.updated",
      entityType: "Project",
      entityId: projectId,
      metadata: { fields: Object.keys(input), name: project.name },
    });
    await recordAudit(req, {
      action: "project.updated",
      organizationId: context.project.organizationId,
      entityType: "Project",
      entityId: projectId,
      metadata: { fields: Object.keys(input) },
    });
    emitToOrg(context.project.organizationId, "project:updated", project);

    res.json({ project });
  }),
);

projectsRouter.delete(
  "/:projectId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "project:manage");

    const project = await prisma.project.update({
      where: { id: context.project.id },
      data: { archived: true, status: "ARCHIVED" },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: project.id,
      actorId: req.user!.id,
      action: "project.archived",
      entityType: "Project",
      entityId: project.id,
      metadata: { name: project.name },
    });
    await recordAudit(req, {
      action: "project.archived",
      organizationId: context.project.organizationId,
      entityType: "Project",
      entityId: project.id,
    });
    emitToOrg(context.project.organizationId, "project:updated", project);

    res.status(204).send();
  }),
);

projectsRouter.get(
  "/:projectId/members",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    parseQuery(projectMembersQuerySchema, req.query);

    const members = await prisma.projectMember.findMany({
      where: { projectId: context.project.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
      },
      orderBy: { addedAt: "asc" },
    });
    res.json({ members });
  }),
);

projectsRouter.post(
  "/:projectId/members",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "project:manage");
    const input = parseBody(memberSchema, req.body);
    await assertOrgMember(context.project.organizationId, input.userId);

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: context.project.id, userId: input.userId } },
      update: { role: input.role },
      create: {
        projectId: context.project.id,
        userId: input.userId,
        role: input.role,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
      },
    });

    await notifyUsers({
      organizationId: context.project.organizationId,
      userIds: [input.userId],
      type: "ADDED_TO_PROJECT",
      title: "You were added to a project",
      body: `${req.user!.name} added you to ${context.project.name} as ${input.role.toLowerCase()}.`,
      entityType: "Project",
      entityId: context.project.id,
      actorId: req.user!.id,
    });
    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "project.member_added",
      entityType: "Project",
      entityId: context.project.id,
      metadata: { member: member.user.name, role: input.role },
    });
    emitToOrg(context.project.organizationId, "project:member_updated", {
      projectId: context.project.id,
    });

    res.status(201).json({ member });
  }),
);

projectsRouter.patch(
  "/:projectId/members/:userId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "project:manage");
    const input = parseBody(z.object({ role: z.enum(["MANAGER", "CONTRIBUTOR", "VIEWER"]) }), req.body);

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: context.project.id,
          userId: req.params.userId,
        },
      },
    });
    if (!member) throw notFound("Project member not found");

    const updated = await prisma.projectMember.update({
      where: { id: member.id },
      data: { role: input.role },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
      },
    });
    emitToOrg(context.project.organizationId, "project:member_updated", {
      projectId: context.project.id,
    });

    res.json({ member: updated });
  }),
);

projectsRouter.delete(
  "/:projectId/members/:userId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "project:manage");

    if (req.params.userId === context.project.ownerId) {
      throw badRequest("The project owner must remain a project member");
    }
    await prisma.projectMember.deleteMany({
      where: { projectId: context.project.id, userId: req.params.userId },
    });
    emitToOrg(context.project.organizationId, "project:member_updated", {
      projectId: context.project.id,
    });
    res.status(204).send();
  }),
);

projectsRouter.get(
  "/:projectId/columns",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    const columns = await prisma.workflowColumn.findMany({
      where: { projectId: context.project.id },
      orderBy: { position: "asc" },
    });
    res.json({ columns });
  }),
);

projectsRouter.post(
  "/:projectId/columns",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "workflow:manage");
    const input = parseBody(columnSchema, req.body);

    const maxPosition = await prisma.workflowColumn.aggregate({
      where: { projectId: context.project.id },
      _max: { position: true },
    });

    const column = await prisma.workflowColumn.create({
      data: {
        projectId: context.project.id,
        name: input.name,
        position: input.position ?? (maxPosition._max.position ?? 0) + 1,
        isDone: input.isDone ?? false,
        wipLimit: input.wipLimit ?? null,
      },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "workflow.column_created",
      entityType: "WorkflowColumn",
      entityId: column.id,
      metadata: { name: column.name },
    });
    emitToOrg(context.project.organizationId, "workflow:updated", {
      projectId: context.project.id,
    });

    res.status(201).json({ column });
  }),
);

projectsRouter.patch(
  "/:projectId/columns/:columnId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "workflow:manage");
    const input = parseBody(columnSchema.partial(), req.body);

    const existing = await prisma.workflowColumn.findFirst({
      where: { id: req.params.columnId, projectId: context.project.id },
    });
    if (!existing) throw notFound("Column not found");

    if (input.isDone === false && existing.isDone) {
      const doneColumns = await prisma.workflowColumn.count({
        where: { projectId: context.project.id, isDone: true },
      });
      if (doneColumns <= 1) {
        throw badRequest("At least one workflow column must mark tasks complete");
      }
    }

    const column = await prisma.$transaction(async (tx) => {
      if (input.isDone !== undefined && input.isDone !== existing.isDone) {
        if (input.isDone) {
          await tx.task.updateMany({
            where: { columnId: existing.id, completedAt: null },
            data: { completedAt: new Date() },
          });
        } else {
          await tx.task.updateMany({
            where: { columnId: existing.id },
            data: { completedAt: null },
          });
        }
      }

      return tx.workflowColumn.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.isDone !== undefined ? { isDone: input.isDone } : {}),
          ...(input.wipLimit !== undefined ? { wipLimit: input.wipLimit } : {}),
        },
      });
    });

    emitToOrg(context.project.organizationId, "workflow:updated", {
      projectId: context.project.id,
    });
    res.json({ column });
  }),
);

projectsRouter.delete(
  "/:projectId/columns/:columnId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "workflow:manage");

    const existing = await prisma.workflowColumn.findFirst({
      where: { id: req.params.columnId, projectId: context.project.id },
    });
    if (!existing) throw notFound("Column not found");

    const [taskCount, columnCount] = await Promise.all([
      prisma.task.count({ where: { columnId: existing.id } }),
      prisma.workflowColumn.count({ where: { projectId: context.project.id } }),
    ]);
    if (taskCount > 0) throw conflict("Move tasks out of this column before deleting it");
    if (columnCount <= 1) throw badRequest("A project needs at least one workflow column");

    await prisma.workflowColumn.delete({ where: { id: existing.id } });
    emitToOrg(context.project.organizationId, "workflow:updated", {
      projectId: context.project.id,
    });
    res.status(204).send();
  }),
);

projectsRouter.get(
  "/:projectId/milestones",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    const milestones = await prisma.milestone.findMany({
      where: { projectId: context.project.id },
      orderBy: { dueDate: "asc" },
    });
    res.json({ milestones });
  }),
);

projectsRouter.post(
  "/:projectId/milestones",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "milestone:manage");
    const input = parseBody(milestoneSchema, req.body);

    const milestone = await prisma.milestone.create({
      data: {
        projectId: context.project.id,
        name: input.name,
        description: input.description,
        dueDate: input.dueDate,
        status: input.status ?? "PENDING",
        completedAt: input.status === "COMPLETED" ? new Date() : null,
      },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "milestone.created",
      entityType: "Milestone",
      entityId: milestone.id,
      metadata: { name: milestone.name },
    });
    emitToOrg(context.project.organizationId, "milestone:updated", {
      projectId: context.project.id,
    });

    res.status(201).json({ milestone });
  }),
);

projectsRouter.patch(
  "/:projectId/milestones/:milestoneId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "milestone:manage");
    const input = parseBody(milestoneSchema.partial(), req.body);

    const existing = await prisma.milestone.findFirst({
      where: { id: req.params.milestoneId, projectId: context.project.id },
    });
    if (!existing) throw notFound("Milestone not found");

    const milestone = await prisma.milestone.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              completedAt:
                input.status === "COMPLETED"
                  ? existing.completedAt ?? new Date()
                  : null,
            }
          : {}),
      },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "milestone.updated",
      entityType: "Milestone",
      entityId: milestone.id,
      metadata: { name: milestone.name, status: milestone.status },
    });
    emitToOrg(context.project.organizationId, "milestone:updated", {
      projectId: context.project.id,
    });

    res.json({ milestone });
  }),
);

projectsRouter.delete(
  "/:projectId/milestones/:milestoneId",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "milestone:manage");
    const existing = await prisma.milestone.findFirst({
      where: { id: req.params.milestoneId, projectId: context.project.id },
    });
    if (!existing) throw notFound("Milestone not found");
    await prisma.milestone.delete({ where: { id: existing.id } });
    emitToOrg(context.project.organizationId, "milestone:updated", {
      projectId: context.project.id,
    });
    res.status(204).send();
  }),
);

projectsRouter.get(
  "/:projectId/analytics",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    const analytics = await getProjectAnalytics(context.project.id);
    res.json(analytics);
  }),
);

projectsRouter.get(
  "/:projectId/report",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "report:read");
    const query = parseQuery(reportQuerySchema, req.query);

    const [project, tasks, milestones, sprints] = await Promise.all([
      prisma.project.findUnique({
        where: { id: context.project.id },
        include: {
          owner: { select: { name: true, email: true } },
          team: { select: { name: true } },
        },
      }),
      prisma.task.findMany({
        where: { projectId: context.project.id, archived: false },
        include: {
          column: { select: { name: true, isDone: true } },
          sprint: { select: { name: true } },
          category: { select: { name: true } },
          assignments: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { number: "asc" },
      }),
      prisma.milestone.findMany({
        where: { projectId: context.project.id },
        orderBy: { dueDate: "asc" },
      }),
      prisma.sprint.findMany({
        where: { projectId: context.project.id },
        orderBy: { startDate: "asc" },
      }),
    ]);

    const summary = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => task.column.isDone).length,
      overdueTasks: tasks.filter(
        (task) =>
          !task.column.isDone && task.dueDate && task.dueDate.getTime() < Date.now(),
      ).length,
      totalStoryPoints: tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      completedStoryPoints: tasks
        .filter((task) => task.column.isDone)
        .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
    };

    await recordAudit(req, {
      action: "report.exported",
      organizationId: context.project.organizationId,
      entityType: "Project",
      entityId: context.project.id,
      metadata: { format: query.format },
    });

    if (query.format === "csv") {
      const rows = [
        [
          "Key",
          "Title",
          "Status",
          "Priority",
          "Category",
          "Assignees",
          "Sprint",
          "Due date",
          "Estimate hours",
          "Story points",
          "Created",
          "Completed",
        ],
        ...tasks.map((task) => [
          `${context.project.key}-${task.number}`,
          task.title,
          task.column.name,
          task.priority,
          task.category?.name ?? "",
          task.assignments.map((assignment) => assignment.user.name).join("; "),
          task.sprint?.name ?? "",
          task.dueDate,
          task.estimateHours,
          task.storyPoints,
          task.createdAt,
          task.completedAt,
        ]),
      ];

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="teamflow-${context.project.key.toLowerCase()}-report.csv"`,
      );
      res.send(`\uFEFF${toCsv(rows)}`);
      return;
    }

    res.json({
      generatedAt: new Date().toISOString(),
      project,
      summary,
      tasks: tasks.map((task) => ({
        ...task,
        assignees: task.assignments.map((assignment) => assignment.user),
        assignments: undefined,
      })),
      milestones,
      sprints,
    });
  }),
);
