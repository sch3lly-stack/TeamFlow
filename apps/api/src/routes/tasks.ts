import { Prisma, Priority } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { isOrgAdmin } from "../domain/permissions";
import { env } from "../env";
import { asyncHandler, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { sanitizeFilename, upload } from "../lib/uploads";
import { authenticate } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { emitToOrg } from "../realtime";
import {
  getProjectContext,
  getTaskContext,
  requireProjectCapability,
} from "../services/access";
import { recordActivity } from "../services/activity";
import { recordAudit } from "../services/audit";
import { notifyUsers } from "../services/notifications";

const taskInclude = {
  column: { select: { id: true, name: true, isDone: true, position: true } },
  category: { select: { id: true, name: true, color: true } },
  sprint: {
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  },
  assignments: {
    include: {
      user: { select: { id: true, name: true, email: true, avatarColor: true } },
    },
  },
  createdBy: { select: { id: true, name: true, avatarColor: true } },
  dependencies: {
    include: {
      dependsOn: {
        select: {
          id: true,
          number: true,
          title: true,
          column: { select: { name: true, isDone: true } },
        },
      },
    },
  },
  dependents: {
    include: {
      task: {
        select: {
          id: true,
          number: true,
          title: true,
          column: { select: { name: true, isDone: true } },
        },
      },
    },
  },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

const taskFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  columnId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  priority: z.nativeEnum(Priority).optional(),
  sprintId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  due: z.enum(["overdue", "today", "week"]).optional(),
});

const taskCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(10_000).optional(),
    priority: z.nativeEnum(Priority).optional(),
    columnId: z.string().min(1).optional(),
    sprintId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    assigneeIds: z.array(z.string().min(1)).max(20).optional(),
    estimateHours: z.number().min(0).max(1000).nullable().optional(),
    storyPoints: z.number().int().min(0).max(100).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    position: z.number().min(0).max(1_000_000).optional(),
  })
  .refine(
    (value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate,
    { message: "The start date must be before the due date", path: ["dueDate"] },
  );

const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    priority: z.nativeEnum(Priority).optional(),
    columnId: z.string().min(1).optional(),
    sprintId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    assigneeIds: z.array(z.string().min(1)).max(20).optional(),
    estimateHours: z.number().min(0).max(1000).nullable().optional(),
    storyPoints: z.number().int().min(0).max(100).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    position: z.number().min(0).max(1_000_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided");

const moveSchema = z.object({
  columnId: z.string().min(1),
  position: z.number().min(0).max(1_000_000).optional(),
});

const commentSchema = z.object({
  body: z.string().trim().min(1, "Write a comment first").max(5000),
});

const dependencySchema = z.object({
  dependsOnTaskId: z.string().min(1),
});

/** Task collection under /api/projects/:projectId/tasks */
export const projectTasksRouter = Router({ mergeParams: true });
projectTasksRouter.use(authenticate);

projectTasksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    const query = parseQuery(taskFilterSchema, req.query);

    const now = new Date();
    const dueFilter =
      query.due === "overdue"
        ? { dueDate: { lt: now } }
        : query.due === "today"
          ? {
              dueDate: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lte: new Date(new Date().setHours(23, 59, 59, 999)),
              },
            }
          : query.due === "week"
            ? {
                dueDate: {
                  gte: now,
                  lte: new Date(now.getTime() + 7 * 86_400_000),
                },
              }
            : {};

    const tasks = await prisma.task.findMany({
      where: {
        projectId: context.project.id,
        archived: false,
        ...(query.columnId ? { columnId: query.columnId } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.sprintId
          ? query.sprintId === "none"
            ? { sprintId: null }
            : { sprintId: query.sprintId }
          : {}),
        ...(query.assigneeId
          ? { assignments: { some: { userId: query.assigneeId } } }
          : {}),
        ...(query.due === "overdue" ? { column: { isDone: false } } : {}),
        ...dueFilter,
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: "insensitive" } },
                { description: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: taskInclude,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 1000,
    });

    res.json({
      tasks,
      project: {
        id: context.project.id,
        name: context.project.name,
        key: context.project.key,
        color: context.project.color,
      },
      permissions: [...context.capabilities],
    });
  }),
);

projectTasksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const context = await getProjectContext(req.user!.id, req.params.projectId);
    requireProjectCapability(context, "task:write");
    const input = parseBody(taskCreateSchema, req.body);

    const [columns, projectSprints, categories] = await Promise.all([
      prisma.workflowColumn.findMany({
        where: { projectId: context.project.id },
        orderBy: { position: "asc" },
      }),
      prisma.sprint.findMany({
        where: { projectId: context.project.id },
        select: { id: true, status: true },
      }),
      prisma.taskCategory.findMany({
        where: { organizationId: context.project.organizationId },
        select: { id: true },
      }),
    ]);

    const column = input.columnId
      ? columns.find((candidate) => candidate.id === input.columnId)
      : columns[0];
    if (!column) throw badRequest("Workflow column not found in this project");

    if (input.sprintId) {
      const sprint = projectSprints.find((candidate) => candidate.id === input.sprintId);
      if (!sprint) throw badRequest("Sprint not found in this project");
      if (sprint.status === "COMPLETED") {
        throw badRequest("Tasks cannot be added to a completed sprint");
      }
    }

    if (input.categoryId) {
      if (!categories.some((category) => category.id === input.categoryId)) {
        throw badRequest("Category not found in this organization");
      }
    }

    const assigneeIds = [...new Set(input.assigneeIds ?? [])];
    if (assigneeIds.length > 0) {
      const memberships = await prisma.membership.findMany({
        where: {
          organizationId: context.project.organizationId,
          userId: { in: assigneeIds },
        },
        select: { userId: true },
      });
      if (memberships.length !== assigneeIds.length) {
        throw badRequest("All assignees must be members of this organization");
      }
    }

    const task = await prisma.$transaction(async (tx) => {
      const counter = await tx.project.update({
        where: { id: context.project.id },
        data: { taskCounter: { increment: 1 } },
        select: { taskCounter: true },
      });

      const maxPosition = await tx.task.aggregate({
        where: { projectId: context.project.id, columnId: column.id },
        _max: { position: true },
      });

      return tx.task.create({
        data: {
          organizationId: context.project.organizationId,
          projectId: context.project.id,
          columnId: column.id,
          categoryId: input.categoryId ?? null,
          sprintId: input.sprintId ?? null,
          number: counter.taskCounter,
          title: input.title,
          description: input.description,
          priority: input.priority ?? "MEDIUM",
          estimateHours: input.estimateHours ?? null,
          storyPoints: input.storyPoints ?? null,
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          completedAt: column.isDone ? new Date() : null,
          position: input.position ?? (maxPosition._max.position ?? 0) + 1000,
          createdById: req.user!.id,
          assignments: {
            create: assigneeIds.map((userId) => ({ userId })),
          },
        },
        include: taskInclude,
      });
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      taskId: task.id,
      actorId: req.user!.id,
      action: "task.created",
      entityType: "Task",
      entityId: task.id,
      metadata: {
        number: task.number,
        title: task.title,
        column: task.column.name,
      },
    });

    if (assigneeIds.length > 0) {
      await notifyUsers({
        organizationId: context.project.organizationId,
        userIds: assigneeIds,
        type: "TASK_ASSIGNED",
        title: `${context.project.key}-${task.number} assigned to you`,
        body: task.title,
        entityType: "Task",
        entityId: task.id,
        actorId: req.user!.id,
      });
    }

    emitToOrg(context.project.organizationId, "task:created", task);

    res.status(201).json({ task });
  }),
);

/** Flat task routes. */
export const tasksRouter = Router();
tasksRouter.use(authenticate);

tasksRouter.get(
  "/:taskId",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);

    const [task, project] = await Promise.all([
      prisma.task.findUnique({
        where: { id: context.task.id },
        include: {
          ...taskInclude,
          comments: {
            include: {
              author: { select: { id: true, name: true, avatarColor: true } },
            },
            orderBy: { createdAt: "asc" },
            take: 100,
          },
          attachments: {
            include: {
              uploader: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          activities: {
            include: {
              actor: { select: { id: true, name: true, avatarColor: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      }),
      prisma.project.findUnique({
        where: { id: context.project.id },
        select: { id: true, name: true, key: true, color: true, ownerId: true },
      }),
    ]);

    if (!task) throw notFound("Task not found");

    res.json({
      task,
      project,
      permissions: [...context.capabilities],
      organizationRole: context.membership.role,
      projectRole: context.projectMember?.role ?? null,
    });
  }),
);

tasksRouter.patch(
  "/:taskId",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "task:write");
    const input = parseBody(taskUpdateSchema, req.body);

    const existing = await prisma.task.findUnique({
      where: { id: context.task.id },
      include: {
        column: true,
        assignments: { select: { userId: true } },
        sprint: { select: { id: true, status: true } },
      },
    });
    if (!existing) throw notFound("Task not found");

    let targetColumn = existing.column;
    if (input.columnId && input.columnId !== existing.columnId) {
      const column = await prisma.workflowColumn.findFirst({
        where: { id: input.columnId, projectId: context.project.id },
      });
      if (!column) throw badRequest("Workflow column not found in this project");
      targetColumn = column;
    }

    if (input.sprintId) {
      const sprint = await prisma.sprint.findFirst({
        where: { id: input.sprintId, projectId: context.project.id },
        select: { id: true, status: true },
      });
      if (!sprint) throw badRequest("Sprint not found in this project");
      if (sprint.status === "COMPLETED" && input.sprintId !== existing.sprintId) {
        throw badRequest("Tasks cannot be added to a completed sprint");
      }
    }

    if (input.categoryId) {
      const category = await prisma.taskCategory.findFirst({
        where: {
          id: input.categoryId,
          organizationId: context.project.organizationId,
        },
        select: { id: true },
      });
      if (!category) throw badRequest("Category not found in this organization");
    }

    const startDate =
      input.startDate !== undefined ? input.startDate : existing.startDate;
    const dueDate = input.dueDate !== undefined ? input.dueDate : existing.dueDate;
    if (startDate && dueDate && startDate > dueDate) {
      throw badRequest("The start date must be before the due date");
    }

    let assigneeIds: string[] | null = null;
    if (input.assigneeIds) {
      assigneeIds = [...new Set(input.assigneeIds)];
      if (assigneeIds.length > 0) {
        const memberships = await prisma.membership.findMany({
          where: {
            organizationId: context.project.organizationId,
            userId: { in: assigneeIds },
          },
          select: { userId: true },
        });
        if (memberships.length !== assigneeIds.length) {
          throw badRequest("All assignees must be members of this organization");
        }
      }
    }

    const columnChanged = targetColumn.id !== existing.columnId;
    let completedAt = existing.completedAt;
    if (columnChanged) {
      completedAt = targetColumn.isDone ? existing.completedAt ?? new Date() : null;
    }

    const task = await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.columnId !== undefined ? { columnId: targetColumn.id } : {}),
          ...(input.sprintId !== undefined ? { sprintId: input.sprintId } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.estimateHours !== undefined ? { estimateHours: input.estimateHours } : {}),
          ...(input.storyPoints !== undefined ? { storyPoints: input.storyPoints } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(columnChanged ? { completedAt } : {}),
        },
      });

      if (assigneeIds) {
        await tx.taskAssignment.deleteMany({
          where: { taskId: existing.id, userId: { notIn: assigneeIds } },
        });
        if (assigneeIds.length > 0) {
          await tx.taskAssignment.createMany({
            data: assigneeIds.map((userId) => ({ taskId: existing.id, userId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.task.findUniqueOrThrow({
        where: { id: existing.id },
        include: taskInclude,
      });
    });

    if (assigneeIds) {
      const previous = new Set(existing.assignments.map((assignment) => assignment.userId));
      const added = assigneeIds.filter((userId) => !previous.has(userId));
      if (added.length > 0) {
        await notifyUsers({
          organizationId: context.project.organizationId,
          userIds: added,
          type: "TASK_ASSIGNED",
          title: `${context.project.key}-${task.number} assigned to you`,
          body: task.title,
          entityType: "Task",
          entityId: task.id,
          actorId: req.user!.id,
        });
      }
    }

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      taskId: task.id,
      actorId: req.user!.id,
      action: columnChanged ? "task.moved" : "task.updated",
      entityType: "Task",
      entityId: task.id,
      metadata: {
        number: task.number,
        title: task.title,
        fields: Object.keys(input),
        ...(columnChanged
          ? { from: existing.column.name, to: targetColumn.name }
          : {}),
      },
    });

    emitToOrg(
      context.project.organizationId,
      columnChanged ? "task:moved" : "task:updated",
      task,
    );

    res.json({ task });
  }),
);

tasksRouter.patch(
  "/:taskId/move",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "task:write");
    const input = parseBody(moveSchema, req.body);

    const existing = await prisma.task.findUnique({
      where: { id: context.task.id },
      include: { column: true },
    });
    if (!existing) throw notFound("Task not found");

    const targetColumn = await prisma.workflowColumn.findFirst({
      where: { id: input.columnId, projectId: context.project.id },
    });
    if (!targetColumn) throw badRequest("Workflow column not found in this project");

    const maxPosition =
      input.position === undefined
        ? await prisma.task.aggregate({
            where: { projectId: context.project.id, columnId: targetColumn.id },
            _max: { position: true },
          })
        : null;

    const position = input.position ?? (maxPosition?._max.position ?? 0) + 1000;
    const completedAt = targetColumn.isDone
      ? existing.completedAt ?? new Date()
      : null;

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: { columnId: targetColumn.id, position, completedAt },
      include: taskInclude,
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      taskId: task.id,
      actorId: req.user!.id,
      action: "task.moved",
      entityType: "Task",
      entityId: task.id,
      metadata: {
        number: task.number,
        title: task.title,
        from: existing.column.name,
        to: targetColumn.name,
      },
    });

    emitToOrg(context.project.organizationId, "task:moved", task);

    res.json({ task });
  }),
);

tasksRouter.delete(
  "/:taskId",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "task:delete");

    await prisma.task.delete({ where: { id: context.task.id } });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      actorId: req.user!.id,
      action: "task.deleted",
      entityType: "Task",
      entityId: context.task.id,
      metadata: { title: context.task.title },
    });
    await recordAudit(req, {
      action: "task.deleted",
      organizationId: context.project.organizationId,
      entityType: "Task",
      entityId: context.task.id,
      metadata: { title: context.task.title },
    });
    emitToOrg(context.project.organizationId, "task:deleted", {
      taskId: context.task.id,
      projectId: context.project.id,
    });

    res.status(204).send();
  }),
);

tasksRouter.get(
  "/:taskId/comments",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    const comments = await prisma.comment.findMany({
      where: { taskId: context.task.id },
      include: { author: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({ comments });
  }),
);

tasksRouter.post(
  "/:taskId/comments",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "comment:write");
    const input = parseBody(commentSchema, req.body);

    const task = await prisma.task.findUnique({
      where: { id: context.task.id },
      include: {
        assignments: { select: { userId: true } },
        project: { select: { key: true, name: true } },
      },
    });
    if (!task) throw notFound("Task not found");

    const comment = await prisma.comment.create({
      data: {
        taskId: task.id,
        authorId: req.user!.id,
        body: input.body,
      },
      include: { author: { select: { id: true, name: true, avatarColor: true } } },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      taskId: task.id,
      actorId: req.user!.id,
      action: "comment.created",
      entityType: "Comment",
      entityId: comment.id,
      metadata: { task: `${task.project.key}-${task.number}`, excerpt: input.body.slice(0, 140) },
    });

    await notifyUsers({
      organizationId: context.project.organizationId,
      userIds: [
        ...task.assignments.map((assignment) => assignment.userId),
        task.createdById,
      ],
      type: "TASK_COMMENTED",
      title: `New comment on ${task.project.key}-${task.number}`,
      body: input.body.slice(0, 140),
      entityType: "Task",
      entityId: task.id,
      actorId: req.user!.id,
    });

    emitToOrg(context.project.organizationId, "comment:created", {
      taskId: task.id,
      projectId: context.project.id,
      comment,
    });

    res.status(201).json({ comment });
  }),
);

tasksRouter.patch(
  "/:taskId/comments/:commentId",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "comment:write");
    const input = parseBody(commentSchema, req.body);

    const comment = await prisma.comment.findFirst({
      where: { id: req.params.commentId, taskId: context.task.id },
    });
    if (!comment) throw notFound("Comment not found");

    if (comment.authorId !== req.user!.id && !isOrgAdmin(context.membership.role)) {
      throw forbidden("You can only edit your own comments");
    }

    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data: { body: input.body },
      include: { author: { select: { id: true, name: true, avatarColor: true } } },
    });
    emitToOrg(context.project.organizationId, "comment:updated", {
      taskId: context.task.id,
      projectId: context.project.id,
      comment: updated,
    });
    res.json({ comment: updated });
  }),
);

tasksRouter.delete(
  "/:taskId/comments/:commentId",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    const comment = await prisma.comment.findFirst({
      where: { id: req.params.commentId, taskId: context.task.id },
    });
    if (!comment) throw notFound("Comment not found");
    if (comment.authorId !== req.user!.id && !isOrgAdmin(context.membership.role)) {
      throw forbidden("You can only delete your own comments");
    }
    await prisma.comment.delete({ where: { id: comment.id } });
    emitToOrg(context.project.organizationId, "comment:deleted", {
      taskId: context.task.id,
      projectId: context.project.id,
      commentId: comment.id,
    });
    res.status(204).send();
  }),
);

tasksRouter.get(
  "/:taskId/activity",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    const activity = await prisma.activityLog.findMany({
      where: { taskId: context.task.id },
      include: { actor: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ activity });
  }),
);

tasksRouter.post(
  "/:taskId/dependencies",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "task:write");
    const input = parseBody(dependencySchema, req.body);

    if (input.dependsOnTaskId === context.task.id) {
      throw badRequest("A task cannot depend on itself");
    }

    const target = await prisma.task.findUnique({
      where: { id: input.dependsOnTaskId },
      select: { id: true, projectId: true, title: true },
    });
    if (!target || target.projectId !== context.project.id) {
      throw badRequest("Dependencies must be tasks in the same project");
    }

    const edges = await prisma.taskDependency.findMany({
      where: { task: { projectId: context.project.id } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    const graph = new Map<string, string[]>();
    for (const edge of edges) {
      const list = graph.get(edge.taskId) ?? [];
      list.push(edge.dependsOnTaskId);
      graph.set(edge.taskId, list);
    }

    const stack = [input.dependsOnTaskId];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === context.task.id) {
        throw conflict("That dependency would create a circular dependency");
      }
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(graph.get(current) ?? []));
    }

    const dependency = await prisma.taskDependency.create({
      data: {
        taskId: context.task.id,
        dependsOnTaskId: input.dependsOnTaskId,
      },
      include: {
        dependsOn: { select: { id: true, number: true, title: true } },
      },
    });

    await recordActivity({
      organizationId: context.project.organizationId,
      projectId: context.project.id,
      taskId: context.task.id,
      actorId: req.user!.id,
      action: "task.dependency_added",
      entityType: "Task",
      entityId: context.task.id,
      metadata: { dependsOn: target.title },
    });
    emitToOrg(context.project.organizationId, "task:updated", {
      id: context.task.id,
      projectId: context.project.id,
    });

    res.status(201).json({ dependency });
  }),
);

tasksRouter.delete(
  "/:taskId/dependencies/:dependsOnTaskId",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "task:write");

    await prisma.taskDependency.deleteMany({
      where: {
        taskId: context.task.id,
        dependsOnTaskId: req.params.dependsOnTaskId,
      },
    });
    emitToOrg(context.project.organizationId, "task:updated", {
      id: context.task.id,
      projectId: context.project.id,
    });
    res.status(204).send();
  }),
);

tasksRouter.get(
  "/:taskId/attachments",
  asyncHandler(async (req, res) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    const attachments = await prisma.attachment.findMany({
      where: { taskId: context.task.id },
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ attachments });
  }),
);

tasksRouter.post(
  "/:taskId/attachments",
  asyncHandler(async (req, res, next) => {
    const context = await getTaskContext(req.user!.id, req.params.taskId);
    requireProjectCapability(context, "attachment:write");
    res.locals.taskContext = context;
    next();
  }),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const context = res.locals.taskContext as Awaited<ReturnType<typeof getTaskContext>>;
    const file = req.file;
    if (!file) throw badRequest("Choose a file to upload");

    try {
      const attachment = await prisma.attachment.create({
        data: {
          organizationId: context.project.organizationId,
          taskId: context.task.id,
          uploaderId: req.user!.id,
          filename: sanitizeFilename(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          storageKey: file.filename,
        },
        include: { uploader: { select: { id: true, name: true } } },
      });

      await recordActivity({
        organizationId: context.project.organizationId,
        projectId: context.project.id,
        taskId: context.task.id,
        actorId: req.user!.id,
        action: "attachment.uploaded",
        entityType: "Attachment",
        entityId: attachment.id,
        metadata: { filename: attachment.filename },
      });

      emitToOrg(context.project.organizationId, "attachment:created", {
        taskId: context.task.id,
        projectId: context.project.id,
        attachment,
      });

      res.status(201).json({ attachment });
    } catch (error) {
      await unlink(path.join(env.uploadDir, file.filename)).catch(() => undefined);
      throw error;
    }
  }),
);
