import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import {
  AVATAR_COLORS,
  DEFAULT_ORG_SETTINGS,
  DEFAULT_TASK_CATEGORIES,
} from "../domain/defaults";
import { can } from "../domain/permissions";
import { asyncHandler, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { generateUniqueSlug } from "../lib/slug";
import { authenticate } from "../middleware/auth";
import { requireCapability, requireOrg } from "../middleware/org";
import { parseBody, parseQuery } from "../middleware/validate";
import { recordActivity } from "../services/activity";
import { getOrganizationAnalytics, buildWorkload } from "../services/analytics";
import { recordAudit } from "../services/audit";

export const organizationsRouter = Router();

organizationsRouter.use(authenticate);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(500).optional(),
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const settingsSchema = z
  .object({
    weekStart: z.enum(["monday", "sunday"]).optional(),
    defaultPriority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    workloadThresholds: z
      .object({
        openTasks: z.number().int().min(1).max(100).optional(),
        estimatedHours: z.number().min(1).max(400).optional(),
      })
      .strict()
      .optional(),
    notifications: z
      .object({
        realtime: z.boolean().optional(),
        emailInvites: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    settings: settingsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided");

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  projectId: z.string().min(1).optional(),
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  projectId: z.string().min(1).optional(),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

organizationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseBody(createOrganizationSchema, req.body);

    if (input.slug) {
      const taken = await prisma.organization.findUnique({ where: { slug: input.slug } });
      if (taken) throw conflict("That organization URL is already taken");
    }

    const organization = await prisma.$transaction(async (tx) => {
      const slug = input.slug ?? (await generateUniqueSlug(tx, input.name));
      const created = await tx.organization.create({
        data: {
          name: input.name,
          slug,
          description: input.description,
          logoColor: input.logoColor ?? AVATAR_COLORS[0],
          settings: DEFAULT_ORG_SETTINGS,
        },
      });
      await tx.membership.create({
        data: {
          userId: req.user!.id,
          organizationId: created.id,
          role: "OWNER",
          title: "Owner",
        },
      });
      await tx.taskCategory.createMany({
        data: DEFAULT_TASK_CATEGORIES.map((category) => ({
          ...category,
          organizationId: created.id,
        })),
      });
      return created;
    });

    req.organizationId = organization.id;
    await recordAudit(req, {
      action: "organization.created",
      organizationId: organization.id,
      entityType: "Organization",
      entityId: organization.id,
    });

    res.status(201).json({ organization });
  }),
);

organizationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user!.id },
      include: {
        organization: {
          include: {
            _count: { select: { memberships: true, projects: true, teams: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      organizations: memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        description: membership.organization.description,
        logoColor: membership.organization.logoColor,
        settings: membership.organization.settings,
        role: membership.role,
        memberCount: membership.organization._count.memberships,
        projectCount: membership.organization._count.projects,
        teamCount: membership.organization._count.teams,
      })),
    });
  }),
);

organizationsRouter.get(
  "/:orgId",
  requireOrg,
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      include: {
        _count: { select: { memberships: true, projects: true, teams: true, departments: true } },
      },
    });
    if (!organization) throw notFound("Organization not found");

    res.json({
      organization: {
        ...organization,
        memberCount: organization._count.memberships,
        projectCount: organization._count.projects,
        teamCount: organization._count.teams,
        departmentCount: organization._count.departments,
        role: req.membership!.role,
      },
    });
  }),
);

organizationsRouter.patch(
  "/:orgId",
  requireOrg,
  requireCapability("org:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateOrganizationSchema, req.body);

    const current = await prisma.organization.findUnique({ where: { id: req.organizationId } });
    if (!current) throw notFound("Organization not found");

    if (input.slug && input.slug !== current.slug) {
      const taken = await prisma.organization.findUnique({ where: { slug: input.slug } });
      if (taken) throw conflict("That organization URL is already taken");
    }

    const currentSettings = (current.settings ?? {}) as Record<string, unknown>;
    const mergedSettings = input.settings
      ? {
          ...currentSettings,
          ...input.settings,
          workloadThresholds: input.settings.workloadThresholds
            ? {
                ...(currentSettings.workloadThresholds as Record<string, unknown> | undefined),
                ...input.settings.workloadThresholds,
              }
            : currentSettings.workloadThresholds,
          notifications: input.settings.notifications
            ? {
                ...(currentSettings.notifications as Record<string, unknown> | undefined),
                ...input.settings.notifications,
              }
            : currentSettings.notifications,
        }
      : undefined;

    const organization = await prisma.organization.update({
      where: { id: req.organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.logoColor !== undefined ? { logoColor: input.logoColor } : {}),
        ...(mergedSettings !== undefined
          ? { settings: mergedSettings as Prisma.InputJsonValue }
          : {}),
      },
    });

    await recordAudit(req, {
      action: "organization.updated",
      entityType: "Organization",
      entityId: organization.id,
      metadata: { fields: Object.keys(input) },
    });

    res.json({ organization });
  }),
);

organizationsRouter.get(
  "/:orgId/dashboard",
  requireOrg,
  asyncHandler(async (req, res) => {
    const analytics = await getOrganizationAnalytics(req.organizationId!, 8);

    const projects = await prisma.project.findMany({
      where: { organizationId: req.organizationId, archived: false },
      select: {
        id: true,
        name: true,
        key: true,
        color: true,
        status: true,
        priority: true,
        dueDate: true,
        owner: { select: { id: true, name: true, avatarColor: true } },
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    const projectIds = projects.map((project) => project.id);
    const doneTasks =
      projectIds.length === 0
        ? []
        : await prisma.task.findMany({
            where: {
              projectId: { in: projectIds },
              archived: false,
              column: { isDone: true },
            },
            select: { projectId: true },
          });
    const doneByProject = new Map<string, number>();
    for (const task of doneTasks) {
      doneByProject.set(task.projectId, (doneByProject.get(task.projectId) ?? 0) + 1);
    }

    res.json({
      kpis: analytics.kpis,
      activeSprints: analytics.activeSprints,
      upcomingMilestones: analytics.upcomingMilestones,
      recentActivity: analytics.recentActivity,
      workload: analytics.workload,
      completionTrend: analytics.completionTrend,
      projectStatus: analytics.projectStatus,
      throughput: analytics.throughput,
      projects: projects.map((project) => ({
        ...project,
        completedTasks: doneByProject.get(project.id) ?? 0,
        progress:
          project._count.tasks === 0
            ? 0
            : Math.round(((doneByProject.get(project.id) ?? 0) / project._count.tasks) * 100),
      })),
      note: analytics.note,
    });
  }),
);

organizationsRouter.get(
  "/:orgId/analytics",
  requireOrg,
  asyncHandler(async (req, res) => {
    const weeks = Math.min(26, Math.max(4, Number(req.query.weeks) || 8));
    const analytics = await getOrganizationAnalytics(req.organizationId!, weeks);
    res.json(analytics);
  }),
);

organizationsRouter.get(
  "/:orgId/workload",
  requireOrg,
  asyncHandler(async (req, res) => {
    const query = z
      .object({ teamId: z.string().min(1).optional(), projectId: z.string().min(1).optional() })
      .parse(req.query);

    if (query.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: query.projectId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!project) throw notFound("Project not found");
    }

    const workload = await buildWorkload(req.organizationId!, {
      teamId: query.teamId,
      projectId: query.projectId,
    });
    res.json(workload);
  }),
);

organizationsRouter.get(
  "/:orgId/activity",
  requireOrg,
  asyncHandler(async (req, res) => {
    const query = parseQuery(activityQuerySchema, req.query);
    if (query.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: query.projectId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!project) throw notFound("Project not found");
    }

    const activity = await prisma.activityLog.findMany({
      where: {
        organizationId: req.organizationId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      include: {
        actor: { select: { id: true, name: true, avatarColor: true } },
        project: { select: { id: true, name: true, key: true } },
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });

    res.json({ activity });
  }),
);

organizationsRouter.get(
  "/:orgId/calendar",
  requireOrg,
  asyncHandler(async (req, res) => {
    const query = parseQuery(dateRangeSchema, req.query);
    if (query.from > query.to) throw badRequest("The range start must be before its end");
    if (query.to.getTime() - query.from.getTime() > 366 * 86_400_000) {
      throw badRequest("Calendar ranges are limited to one year");
    }
    if (query.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: query.projectId, organizationId: req.organizationId },
        select: { id: true, organizationId: true },
      });
      if (!project) throw notFound("Project not found");
    }

    const projectFilter = query.projectId
      ? { id: query.projectId, organizationId: req.organizationId }
      : { organizationId: req.organizationId, archived: false };

    const [tasks, milestones, sprints] = await Promise.all([
      prisma.task.findMany({
        where: {
          project: projectFilter,
          archived: false,
          dueDate: { gte: query.from, lte: query.to },
        },
        select: {
          id: true,
          number: true,
          title: true,
          dueDate: true,
          priority: true,
          project: { select: { id: true, name: true, key: true, color: true } },
          column: { select: { name: true, isDone: true } },
          assignments: { select: { user: { select: { id: true, name: true, avatarColor: true } } } },
        },
        orderBy: { dueDate: "asc" },
        take: 500,
      }),
      prisma.milestone.findMany({
        where: {
          project: projectFilter,
          dueDate: { gte: query.from, lte: query.to },
        },
        select: {
          id: true,
          name: true,
          dueDate: true,
          status: true,
          project: { select: { id: true, name: true, key: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.sprint.findMany({
        where: {
          project: projectFilter,
          startDate: { lte: query.to },
          endDate: { gte: query.from },
        },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          project: { select: { id: true, name: true, key: true, color: true } },
          _count: { select: { tasks: true } },
        },
        orderBy: { startDate: "asc" },
      }),
    ]);

    const events = [
      ...tasks.map((task) => ({
        id: `task-${task.id}`,
        entityId: task.id,
        type: "task" as const,
        title: `${task.project.key}-${task.number} ${task.title}`,
        date: task.dueDate!.toISOString(),
        endDate: null,
        project: task.project,
        priority: task.priority,
        status: task.column.name,
        isDone: task.column.isDone,
        assignees: task.assignments.map((assignment) => assignment.user),
      })),
      ...milestones.map((milestone) => ({
        id: `milestone-${milestone.id}`,
        entityId: milestone.id,
        type: "milestone" as const,
        title: milestone.name,
        date: milestone.dueDate.toISOString(),
        endDate: null,
        project: milestone.project,
        priority: null,
        status: milestone.status,
        isDone: milestone.status === "COMPLETED",
        assignees: [],
      })),
      ...sprints.map((sprint) => ({
        id: `sprint-${sprint.id}`,
        entityId: sprint.id,
        type: "sprint" as const,
        title: sprint.name,
        date: sprint.startDate.toISOString(),
        endDate: sprint.endDate.toISOString(),
        project: sprint.project,
        priority: null,
        status: sprint.status,
        isDone: sprint.status === "COMPLETED",
        assignees: [],
        taskCount: sprint._count.tasks,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    res.json({ events });
  }),
);

organizationsRouter.get(
  "/:orgId/audit-logs",
  requireOrg,
  requireCapability("audit:read"),
  asyncHandler(async (req, res) => {
    const query = parseQuery(auditQuerySchema, req.query);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId: req.organizationId },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.auditLog.count({ where: { organizationId: req.organizationId } }),
    ]);

    res.json({ logs, total, page: query.page, limit: query.limit });
  }),
);

organizationsRouter.get(
  "/:orgId/search",
  requireOrg,
  asyncHandler(async (req, res) => {
    const query = parseQuery(searchQuerySchema, req.query);
    const term = query.q;

    const [tasks, projects, people] = await Promise.all([
      prisma.task.findMany({
        where: {
          organizationId: req.organizationId,
          archived: false,
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          number: true,
          title: true,
          priority: true,
          project: { select: { id: true, name: true, key: true, color: true } },
          column: { select: { name: true, isDone: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.project.findMany({
        where: {
          organizationId: req.organizationId,
          archived: false,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { key: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, key: true, color: true, status: true },
        take: 5,
      }),
      prisma.membership.findMany({
        where: {
          organizationId: req.organizationId,
          user: {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
            ],
          },
        },
        select: {
          user: { select: { id: true, name: true, email: true, avatarColor: true } },
          role: true,
          title: true,
        },
        take: 5,
      }),
    ]);

    res.json({ tasks, projects, people });
  }),
);

organizationsRouter.get(
  "/:orgId/categories",
  requireOrg,
  asyncHandler(async (req, res) => {
    const categories = await prisma.taskCategory.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { name: "asc" },
    });
    res.json({ categories });
  }),
);

organizationsRouter.post(
  "/:orgId/categories",
  requireOrg,
  requireCapability("org:manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(categorySchema, req.body);
    const category = await prisma.taskCategory.create({
      data: {
        organizationId: req.organizationId!,
        name: input.name,
        color: input.color ?? "#64748b",
      },
    });
    await recordActivity({
      organizationId: req.organizationId!,
      actorId: req.user!.id,
      action: "category.created",
      entityType: "TaskCategory",
      entityId: category.id,
      metadata: { name: category.name },
    });
    res.status(201).json({ category });
  }),
);

organizationsRouter.get(
  "/:orgId/my-work",
  requireOrg,
  asyncHandler(async (req, res) => {
    const tasks = await prisma.task.findMany({
      where: {
        organizationId: req.organizationId,
        archived: false,
        assignments: { some: { userId: req.user!.id } },
      },
      include: {
        project: { select: { id: true, name: true, key: true, color: true } },
        column: { select: { id: true, name: true, isDone: true, position: true } },
        sprint: { select: { id: true, name: true, status: true, endDate: true } },
        assignments: {
          include: {
            user: { select: { id: true, name: true, avatarColor: true } },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 300,
    });

    const now = new Date();
    const open = tasks.filter((task) => !task.column.isDone);
    res.json({
      tasks,
      summary: {
        total: tasks.length,
        open: open.length,
        completed: tasks.length - open.length,
        overdue: open.filter(
          (task) => task.dueDate && task.dueDate.getTime() < now.getTime(),
        ).length,
        dueThisWeek: open.filter(
          (task) =>
            task.dueDate &&
            task.dueDate >= now &&
            task.dueDate.getTime() <= now.getTime() + 7 * 86_400_000,
        ).length,
      },
    });
  }),
);

organizationsRouter.get(
  "/:orgId/member-options",
  requireOrg,
  asyncHandler(async (req, res) => {
    const members = await prisma.membership.findMany({
      where: { organizationId: req.organizationId },
      select: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
        role: true,
        title: true,
      },
      orderBy: { user: { name: "asc" } },
    });
    res.json({ members });
  }),
);

organizationsRouter.get(
  "/:orgId/can",
  requireOrg,
  asyncHandler(async (req, res) => {
    const capabilities = [
      "org:manage",
      "members:manage",
      "structure:manage",
      "team:manage",
      "project:create",
      "project:manage",
      "workflow:manage",
      "task:write",
      "task:delete",
      "comment:write",
      "attachment:write",
      "sprint:manage",
      "milestone:manage",
      "report:read",
      "audit:read",
    ] as const;

    res.json({
      role: req.membership!.role,
      can: Object.fromEntries(
        capabilities.map((capability) => [capability, can(req.membership!.role, capability)]),
      ),
    });
  }),
);

organizationsRouter.delete(
  "/:orgId/categories/:categoryId",
  requireOrg,
  requireCapability("org:manage"),
  asyncHandler(async (req, res) => {
    const category = await prisma.taskCategory.findFirst({
      where: { id: req.params.categoryId, organizationId: req.organizationId },
    });
    if (!category) throw notFound("Category not found");
    await prisma.taskCategory.delete({ where: { id: category.id } });
    await recordAudit(req, {
      action: "category.deleted",
      entityType: "TaskCategory",
      entityId: category.id,
      metadata: { name: category.name },
    });
    res.status(204).send();
  }),
);
