import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/errors";
import { authenticate } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { emitToOrg } from "../realtime";
import {
  getProjectContext,
  requireProjectCapability,
} from "../services/access";
import { recordActivity } from "../services/activity";
import { getSprintReport } from "../services/analytics";
import { notifyUsers } from "../services/notifications";

const sprintSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    goal: z.string().trim().max(500).nullable().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((value) => value.startDate < value.endDate, {
    message: "The sprint end date must be after its start date",
    path: ["endDate"],
  });

const sprintUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    goal: z.string().trim().max(500).nullable().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided");

const sprintTaskIdsSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(300),
});

const carryOverSchema = z.object({
  targetSprintId: z.string().min(1).nullable(),
});

const sprintStatsSelect = {
  tasks: {
    select: {
      id: true,
      storyPoints: true,
      completedAt: true,
      column: { select: { isDone: true } },
    },
  },
} satisfies Prisma.SprintInclude;

function withSprintStats<
  T extends {
    tasks: { storyPoints: number | null; column: { isDone: boolean } }[];
  },
>(sprint: T) {
  const completed = sprint.tasks.filter((task) => task.column.isDone).length;
  return {
    ...sprint,
    tasks: undefined,
    stats: {
      totalTasks: sprint.tasks.length,
      completedTasks: completed,
      totalPoints: sprint.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      completedPoints: sprint.tasks
        .filter((task) => task.column.isDone)
        .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      progress:
        sprint.tasks.length === 0
          ? 0
          : Math.round((completed / sprint.tasks.length) * 100),
    },
  };
}

async function projectMemberIds(projectId: string): Promise<{ ownerId: string; memberIds: string[] }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, members: { select: { userId: true } } },
  });
  if (!project) throw notFound("Project not found");
  return {
    ownerId: project.ownerId,
    memberIds: project.members.map((member) => member.userId),
  };
}

/** Sprint collection under /api/projects/:projectId/sprints */
export const projectSprintsRouter = Router({ mergeParams: true });
projectSprintsRouter.use(authenticate);

projectSprintsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    const sprints = await prisma.sprint.findMany({
      where: { projectId: context.project.id },
      include: sprintStatsSelect,
      orderBy: { startDate: "desc" },
    });
    res.json({ sprints: sprints.map(withSprintStats) });
  }),
);

projectSprintsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "sprint:manage");
    const input = parseBody(sprintSchema, req.body);

    const duplicate = await prisma.sprint.findUnique({
      where: {
        projectId_name: { projectId: context.project.id, name: input.name },
      },
      select: { id: true },
    });
    if (duplicate) throw conflict("A sprint with that name already exists");

    const sprint = await prisma.sprint.create({
      data: {
        projectId: context.project.id,
        name: input.name,
        goal: input.goal,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "PLANNED",
      },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "sprint.created",
      entityType: "Sprint",
      entityId: sprint.id,
      metadata: { name: sprint.name },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: sprint.id,
    });

    res.status(201).json({ sprint });
  }),
);

/** Flat sprint routes. */
export const sprintsRouter = Router();
sprintsRouter.use(authenticate);

async function sprintContext(userId: string, sprintId: string) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { id: true, projectId: true },
  });
  if (!sprint) throw notFound("Sprint not found");
  const context = await getProjectContext(userId, sprint.projectId);
  return { sprint, context };
}

sprintsRouter.get(
  "/:sprintId",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);

    const full = await prisma.sprint.findUnique({
      where: { id: sprint.id },
      include: {
        tasks: {
          include: {
            column: { select: { id: true, name: true, isDone: true, position: true } },
            assignments: {
              include: {
                user: { select: { id: true, name: true, avatarColor: true } },
              },
            },
          },
          orderBy: [{ position: "asc" }, { number: "asc" }],
        },
      },
    });
    if (!full) throw notFound("Sprint not found");

    const completed = full.tasks.filter((task) => task.column.isDone).length;

    res.json({
      sprint: full,
      project: {
        id: context.project.id,
        name: context.project.name,
        key: context.project.key,
        color: context.project.color,
      },
      stats: {
        totalTasks: full.tasks.length,
        completedTasks: completed,
        totalPoints: full.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
        completedPoints: full.tasks
          .filter((task) => task.column.isDone)
          .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
        progress:
          full.tasks.length === 0 ? 0 : Math.round((completed / full.tasks.length) * 100),
      },
      permissions: [...context.capabilities],
    });
  }),
);

sprintsRouter.patch(
  "/:sprintId",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");
    const input = parseBody(sprintUpdateSchema, req.body);

    const existing = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    if (!existing) throw notFound("Sprint not found");

    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    if (startDate >= endDate) {
      throw badRequest("The sprint end date must be after its start date");
    }

    const updated = await prisma.sprint.update({
      where: { id: sprint.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.goal !== undefined ? { goal: input.goal } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      },
    });

    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: updated.id,
    });
    res.json({ sprint: updated });
  }),
);

sprintsRouter.post(
  "/:sprintId/start",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");

    const existing = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    if (!existing) throw notFound("Sprint not found");
    if (existing.status !== "PLANNED") {
      throw badRequest("Only a planned sprint can be started");
    }

    const active = await prisma.sprint.findFirst({
      where: { projectId: context.project.id, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (active) throw conflict(`Finish ${active.name} before starting another sprint`);

    const updated = await prisma.sprint.update({
      where: { id: sprint.id },
      data: { status: "ACTIVE" },
    });

    const { ownerId, memberIds } = await projectMemberIds(context.project.id);
    await notifyUsers({
      organizationId: context.project.organizationId,
      userIds: [ownerId, ...memberIds],
      type: "SPRINT_STARTED",
      title: `${context.project.name}: ${updated.name} started`,
      body: updated.goal ?? "Sprint planning is complete.",
      entityType: "Sprint",
      entityId: updated.id,
      actorId: req.user!.id,
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "sprint.started",
      entityType: "Sprint",
      entityId: updated.id,
      metadata: { name: updated.name },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: updated.id,
    });

    res.json({ sprint: updated });
  }),
);

sprintsRouter.post(
  "/:sprintId/complete",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");

    const existing = await prisma.sprint.findUnique({
      where: { id: sprint.id },
      include: {
        tasks: { select: { id: true, storyPoints: true, column: { select: { isDone: true } } } },
      },
    });
    if (!existing) throw notFound("Sprint not found");
    if (existing.status !== "ACTIVE") {
      throw badRequest("Only an active sprint can be completed");
    }

    const updated = await prisma.sprint.update({
      where: { id: sprint.id },
      data: { status: "COMPLETED" },
    });

    const completed = existing.tasks.filter((task) => task.column.isDone).length;
    const { ownerId, memberIds } = await projectMemberIds(context.project.id);
    await notifyUsers({
      organizationId: context.project.organizationId,
      userIds: [ownerId, ...memberIds],
      type: "SPRINT_COMPLETED",
      title: `${context.project.name}: ${updated.name} completed`,
      body: `${completed} of ${existing.tasks.length} tasks completed.`,
      entityType: "Sprint",
      entityId: updated.id,
      actorId: req.user!.id,
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "sprint.completed",
      entityType: "Sprint",
      entityId: updated.id,
      metadata: {
        name: updated.name,
        completedTasks: completed,
        incompleteTasks: existing.tasks.length - completed,
      },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: updated.id,
    });

    res.json({ sprint: updated });
  }),
);

sprintsRouter.post(
  "/:sprintId/tasks",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");
    const input = parseBody(sprintTaskIdsSchema, req.body);

    const existing = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    if (!existing) throw notFound("Sprint not found");
    if (existing.status === "COMPLETED") {
      throw badRequest("Tasks cannot be added to a completed sprint");
    }

    const taskIds = [...new Set(input.taskIds)];
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, projectId: context.project.id },
      select: { id: true },
    });
    if (tasks.length !== taskIds.length) {
      throw badRequest("All tasks must belong to this project");
    }

    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds }, projectId: context.project.id },
      data: { sprintId: sprint.id },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "sprint.tasks_added",
      entityType: "Sprint",
      entityId: sprint.id,
      metadata: { count: result.count, name: existing.name },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: sprint.id,
    });

    res.json({ added: result.count });
  }),
);

sprintsRouter.delete(
  "/:sprintId/tasks/:taskId",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");

    await prisma.task.updateMany({
      where: { id: req.params.taskId, sprintId: sprint.id },
      data: { sprintId: null },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: sprint.id,
    });
    res.status(204).send();
  }),
);

sprintsRouter.post(
  "/:sprintId/carry-over",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");
    const input = parseBody(carryOverSchema, req.body);

    if (input.targetSprintId === sprint.id) {
      throw badRequest("Choose a different sprint for carry-over work");
    }
    if (input.targetSprintId) {
      const target = await prisma.sprint.findFirst({
        where: { id: input.targetSprintId, projectId: context.project.id },
      });
      if (!target) throw badRequest("Target sprint not found in this project");
      if (target.status === "COMPLETED") {
        throw badRequest("Tasks cannot be carried into a completed sprint");
      }
    }

    const result = await prisma.task.updateMany({
      where: {
        sprintId: sprint.id,
        archived: false,
        column: { isDone: false },
      },
      data: { sprintId: input.targetSprintId },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "sprint.carry_over",
      entityType: "Sprint",
      entityId: sprint.id,
      metadata: { count: result.count, targetSprintId: input.targetSprintId },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
      sprintId: sprint.id,
    });

    res.json({ moved: result.count });
  }),
);

sprintsRouter.get(
  "/:sprintId/report",
  asyncHandler(async (req, res) => {
    const { sprint } = await sprintContext(req.user!.id, req.params.sprintId);
    const report = await getSprintReport(sprint.id);
    res.json(report);
  }),
);

sprintsRouter.delete(
  "/:sprintId",
  asyncHandler(async (req, res) => {
    const { sprint, context } = await sprintContext(req.user!.id, req.params.sprintId);
    requireProjectCapability(context, "sprint:manage");

    const existing = await prisma.sprint.findUnique({
      where: { id: sprint.id },
      include: { _count: { select: { tasks: true } } },
    });
    if (!existing) throw notFound("Sprint not found");
    if (existing.status === "ACTIVE") throw conflict("Complete the active sprint first");
    if (existing._count.tasks > 0) {
      throw conflict("Move tasks out of this sprint before deleting it");
    }

    await prisma.sprint.delete({ where: { id: sprint.id } });
    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "sprint.deleted",
      entityType: "Sprint",
      entityId: sprint.id,
      metadata: { name: existing.name },
    });
    emitToOrg(context.project.organizationId, "sprint:updated", {
      projectId: context.project.id,
    });
    res.status(204).send();
  }),
);
