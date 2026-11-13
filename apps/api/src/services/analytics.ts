import type { Priority, ProjectStatus } from "@prisma/client";
import { prisma } from "../db";
import { notFound } from "../lib/errors";
import {
  addDays,
  dateKey,
  daysBetween,
  startOfDay,
  startOfWeek,
} from "./date";

const MS_PER_DAY = 86_400_000;
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PROJECT_STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
];

export type WorkloadMember = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: string;
  title: string | null;
  department: string | null;
  openTasks: number;
  overdueTasks: number;
  urgentTasks: number;
  estimatedHours: number;
  overloaded: boolean;
};

export const WORKLOAD_THRESHOLDS = { openTasks: 8, estimatedHours: 40 };

/**
 * Workload is a planning signal based on assigned open tasks and estimates.
 * It intentionally avoids ranking people or treating activity counts as
 * performance.
 */
export async function buildWorkload(
  organizationId: string,
  options: { teamId?: string; projectId?: string } = {},
) {
  let memberFilter: { userId?: { in: string[] } } = {};
  if (options.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: options.teamId, organizationId },
      include: { members: { select: { userId: true } } },
    });
    if (!team) throw notFound("Team not found");
    memberFilter = { userId: { in: team.members.map((member) => member.userId) } };
  }

  const [memberships, tasks] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId, ...memberFilter },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
        department: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        organizationId,
        archived: false,
        column: { isDone: false },
        ...(options.projectId ? { projectId: options.projectId } : {}),
      },
      select: {
        id: true,
        priority: true,
        dueDate: true,
        estimateHours: true,
        assignments: { select: { userId: true } },
      },
    }),
  ]);

  const memberIds = new Set(memberships.map((membership) => membership.userId));
  const byUser = new Map<
    string,
    { openTasks: number; overdueTasks: number; urgentTasks: number; estimatedHours: number }
  >();

  for (const membership of memberships) {
    byUser.set(membership.userId, {
      openTasks: 0,
      overdueTasks: 0,
      urgentTasks: 0,
      estimatedHours: 0,
    });
  }

  let unassignedOpenTasks = 0;
  const now = new Date();

  for (const task of tasks) {
    if (task.assignments.length === 0) {
      unassignedOpenTasks += 1;
      continue;
    }
    for (const assignment of task.assignments) {
      if (!memberIds.has(assignment.userId)) continue;
      const entry = byUser.get(assignment.userId);
      if (!entry) continue;
      entry.openTasks += 1;
      if (task.dueDate && task.dueDate.getTime() < now.getTime()) entry.overdueTasks += 1;
      if (task.priority === "URGENT" || task.priority === "HIGH") entry.urgentTasks += 1;
      entry.estimatedHours += task.estimateHours ?? 0;
    }
  }

  const members: WorkloadMember[] = memberships.map((membership) => {
    const entry = byUser.get(membership.userId)!;
    return {
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      avatarColor: membership.user.avatarColor,
      role: membership.role,
      title: membership.title,
      department: membership.department?.name ?? null,
      openTasks: entry.openTasks,
      overdueTasks: entry.overdueTasks,
      urgentTasks: entry.urgentTasks,
      estimatedHours: Math.round(entry.estimatedHours * 10) / 10,
      overloaded:
        entry.openTasks >= WORKLOAD_THRESHOLDS.openTasks ||
        entry.estimatedHours >= WORKLOAD_THRESHOLDS.estimatedHours,
    };
  });

  members.sort((a, b) => b.estimatedHours - a.estimatedHours || b.openTasks - a.openTasks);

  return {
    members,
    unassignedOpenTasks,
    totals: {
      members: members.length,
      openTasks: tasks.length,
      estimatedHours:
        Math.round(members.reduce((sum, member) => sum + member.estimatedHours, 0) * 10) / 10,
      overdueTasks: members.reduce((sum, member) => sum + member.overdueTasks, 0),
      overloadedMembers: members.filter((member) => member.overloaded).length,
    },
    thresholds: WORKLOAD_THRESHOLDS,
    note: "Workload reflects assigned open tasks and estimates. Use it to rebalance planning, not to rate individuals.",
  };
}

export async function getOrganizationAnalytics(organizationId: string, weeks = 8) {
  const now = new Date();
  const rangeStart = startOfDay(addDays(now, -weeks * 7));

  const [projects, tasks, memberships, sprints, milestones, activity, workload] =
    await Promise.all([
      prisma.project.findMany({
        where: { organizationId, archived: false },
        select: {
          id: true,
          name: true,
          key: true,
          status: true,
          priority: true,
          dueDate: true,
          createdAt: true,
        },
      }),
      prisma.task.findMany({
        where: { organizationId, archived: false },
        select: {
          id: true,
          projectId: true,
          priority: true,
          createdAt: true,
          completedAt: true,
          dueDate: true,
          estimateHours: true,
          storyPoints: true,
          sprintId: true,
          column: { select: { id: true, name: true, isDone: true } },
        },
      }),
      prisma.membership.count({ where: { organizationId } }),
      prisma.sprint.findMany({
        where: { project: { organizationId } },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          projectId: true,
          project: { select: { id: true, name: true, key: true } },
          tasks: {
            select: {
              storyPoints: true,
              completedAt: true,
              column: { select: { isDone: true } },
            },
          },
        },
        orderBy: { endDate: "desc" },
        take: 24,
      }),
      prisma.milestone.findMany({
        where: {
          project: { organizationId },
          status: { not: "COMPLETED" },
        },
        select: {
          id: true,
          name: true,
          dueDate: true,
          status: true,
          project: { select: { id: true, name: true, key: true, color: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 6,
      }),
      prisma.activityLog.findMany({
        where: { organizationId },
        include: {
          actor: { select: { id: true, name: true, avatarColor: true } },
          project: { select: { id: true, name: true, key: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      buildWorkload(organizationId),
    ]);

  const openTasks = tasks.filter((task) => !task.column.isDone);
  const doneTasks = tasks.filter((task) => task.column.isDone);
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && task.dueDate.getTime() < now.getTime(),
  );
  const completedInRange = doneTasks.filter(
    (task) => task.completedAt && task.completedAt >= rangeStart,
  );

  const completionRate =
    tasks.length === 0 ? 0 : Math.round((doneTasks.length / tasks.length) * 1000) / 10;

  const completedWithDueDate = doneTasks.filter((task) => task.dueDate && task.completedAt);
  const onTime = completedWithDueDate.filter(
    (task) => task.completedAt!.getTime() <= task.dueDate!.getTime(),
  );
  const onTimeRate =
    completedWithDueDate.length === 0
      ? 0
      : Math.round((onTime.length / completedWithDueDate.length) * 1000) / 10;

  const completedWithCycle = completedInRange.filter((task) => task.completedAt);
  const avgCycleTimeDays =
    completedWithCycle.length === 0
      ? 0
      : Math.round(
          (completedWithCycle.reduce(
            (sum, task) =>
              sum +
              (task.completedAt!.getTime() - task.createdAt.getTime()) / MS_PER_DAY,
            0,
          ) /
            completedWithCycle.length) *
            10,
        ) / 10;

  const currentWeek = startOfWeek(now);
  const weekStarts = Array.from({ length: weeks }, (_, index) =>
    addDays(currentWeek, -7 * (weeks - 1 - index)),
  );
  const throughput = weekStarts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 7);
    return {
      week: dateKey(weekStart),
      completed: tasks.filter(
        (task) =>
          task.completedAt && task.completedAt >= weekStart && task.completedAt < weekEnd,
      ).length,
      created: tasks.filter(
        (task) => task.createdAt >= weekStart && task.createdAt < weekEnd,
      ).length,
    };
  });

  const completionTrend = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(startOfDay(now), index - 13);
    const nextDay = addDays(day, 1);
    return {
      date: dateKey(day),
      completed: tasks.filter(
        (task) => task.completedAt && task.completedAt >= day && task.completedAt < nextDay,
      ).length,
    };
  });

  const priorityDistribution = PRIORITIES.map((priority) => ({
    priority,
    count: openTasks.filter((task) => task.priority === priority).length,
  }));

  const projectStatus = PROJECT_STATUSES.map((status) => ({
    status,
    count: projects.filter((project) => project.status === status).length,
  })).filter((entry) => entry.count > 0);

  const velocity = sprints
    .filter((sprint) => sprint.status === "COMPLETED")
    .slice(0, 6)
    .reverse()
    .map((sprint) => {
      const completed = sprint.tasks.filter(
        (task) => task.column.isDone && (!task.completedAt || task.completedAt <= sprint.endDate),
      );
      return {
        sprintId: sprint.id,
        name: sprint.name,
        project: sprint.project,
        completedTasks: completed.length,
        completedPoints: completed.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
        totalTasks: sprint.tasks.length,
      };
    });

  const activeSprints = sprints
    .filter((sprint) => sprint.status === "ACTIVE")
    .map((sprint) => {
      const done = sprint.tasks.filter((task) => task.column.isDone).length;
      return {
        id: sprint.id,
        name: sprint.name,
        project: sprint.project,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        totalTasks: sprint.tasks.length,
        completedTasks: done,
        progress: sprint.tasks.length === 0 ? 0 : Math.round((done / sprint.tasks.length) * 100),
      };
    });

  return {
    generatedAt: now.toISOString(),
    rangeWeeks: weeks,
    kpis: {
      activeProjects: projects.filter((project) => project.status === "ACTIVE").length,
      totalProjects: projects.length,
      openTasks: openTasks.length,
      completedTasks: doneTasks.length,
      completedInRange: completedInRange.length,
      overdueTasks: overdueTasks.length,
      activeSprints: activeSprints.length,
      members: memberships,
      completionRate,
      onTimeRate,
      avgCycleTimeDays,
    },
    throughput,
    completionTrend,
    priorityDistribution,
    projectStatus,
    velocity,
    activeSprints,
    upcomingMilestones: milestones,
    recentActivity: activity,
    workload,
    note: "Delivery indicators describe flow and planning load. They are not employee performance scores.",
  };
}

export async function getProjectAnalytics(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      key: true,
      color: true,
      status: true,
      dueDate: true,
      createdAt: true,
    },
  });
  if (!project) throw notFound("Project not found");

  const now = new Date();
  const [tasks, sprints, milestones] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, archived: false },
      select: {
        id: true,
        title: true,
        priority: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        storyPoints: true,
        estimateHours: true,
        sprintId: true,
        column: { select: { id: true, name: true, isDone: true, position: true } },
        assignments: {
          select: {
            user: { select: { id: true, name: true, avatarColor: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sprint.findMany({
      where: { projectId },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
    prisma.milestone.findMany({
      where: { projectId },
      select: { id: true, name: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const doneTasks = tasks.filter((task) => task.column.isDone);
  const openTasks = tasks.filter((task) => !task.column.isDone);
  const overdue = openTasks.filter(
    (task) => task.dueDate && task.dueDate.getTime() < now.getTime(),
  );

  const columns = new Map<
    string,
    { id: string; name: string; position: number; isDone: boolean; count: number }
  >();
  for (const task of tasks) {
    const existing = columns.get(task.column.id);
    if (existing) existing.count += 1;
    else
      columns.set(task.column.id, {
        id: task.column.id,
        name: task.column.name,
        position: task.column.position,
        isDone: task.column.isDone,
        count: 1,
      });
  }

  const byPriority = PRIORITIES.map((priority) => ({
    priority,
    count: openTasks.filter((task) => task.priority === priority).length,
  }));

  const assigneeMap = new Map<
    string,
    { userId: string; name: string; avatarColor: string; open: number; done: number; points: number }
  >();
  for (const task of tasks) {
    for (const assignment of task.assignments) {
      const user = assignment.user;
      const entry =
        assigneeMap.get(user.id) ??
        {
          userId: user.id,
          name: user.name,
          avatarColor: user.avatarColor,
          open: 0,
          done: 0,
          points: 0,
        };
      if (task.column.isDone) entry.done += 1;
      else entry.open += 1;
      entry.points += task.storyPoints ?? 0;
      assigneeMap.set(user.id, entry);
    }
  }

  const completionTrend = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(startOfDay(now), index - 13);
    const nextDay = addDays(day, 1);
    return {
      date: dateKey(day),
      completed: tasks.filter(
        (task) => task.completedAt && task.completedAt >= day && task.completedAt < nextDay,
      ).length,
    };
  });

  const weekStarts = Array.from({ length: 8 }, (_, index) =>
    addDays(startOfWeek(now), -7 * (7 - index)),
  );
  const throughput = weekStarts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 7);
    return {
      week: dateKey(weekStart),
      completed: tasks.filter(
        (task) => task.completedAt && task.completedAt >= weekStart && task.completedAt < weekEnd,
      ).length,
      created: tasks.filter(
        (task) => task.createdAt >= weekStart && task.createdAt < weekEnd,
      ).length,
    };
  });

  const completed = doneTasks.filter((task) => task.completedAt);
  const avgCycleTimeDays =
    completed.length === 0
      ? 0
      : Math.round(
          (completed.reduce(
            (sum, task) => sum + (task.completedAt!.getTime() - task.createdAt.getTime()) / MS_PER_DAY,
            0,
          ) /
            completed.length) *
            10,
        ) / 10;

  const sprintSummaries = sprints.map((sprint) => {
    const sprintTasks = tasks.filter((task) => task.sprintId === sprint.id);
    const sprintDone = sprintTasks.filter((task) => task.column.isDone);
    return {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      totalTasks: sprintTasks.length,
      completedTasks: sprintDone.length,
      completedPoints: sprintDone.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      progress:
        sprintTasks.length === 0
          ? 0
          : Math.round((sprintDone.length / sprintTasks.length) * 100),
    };
  });

  return {
    project,
    generatedAt: now.toISOString(),
    kpis: {
      totalTasks: tasks.length,
      openTasks: openTasks.length,
      completedTasks: doneTasks.length,
      overdueTasks: overdue.length,
      completionRate:
        tasks.length === 0 ? 0 : Math.round((doneTasks.length / tasks.length) * 1000) / 10,
      avgCycleTimeDays,
      totalPoints: tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      completedPoints: doneTasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      unassignedTasks: openTasks.filter((task) => task.assignments.length === 0).length,
    },
    columns: [...columns.values()].sort((a, b) => a.position - b.position),
    byPriority,
    byAssignee: [...assigneeMap.values()].sort((a, b) => b.open - a.open),
    completionTrend,
    throughput,
    sprints: sprintSummaries,
    milestones,
    note: "Delivery indicators describe flow and planning load. They are not employee performance scores.",
  };
}

export async function getSprintReport(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      project: { select: { id: true, name: true, key: true, organizationId: true, color: true } },
      tasks: {
        include: {
          column: { select: { id: true, name: true, isDone: true, position: true } },
          assignments: {
            select: { user: { select: { id: true, name: true, avatarColor: true } } },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!sprint) throw notFound("Sprint not found");

  const totalTasks = sprint.tasks.length;
  const done = sprint.tasks.filter((task) => task.column.isDone);
  const incomplete = sprint.tasks.filter((task) => !task.column.isDone);
  const totalPoints = sprint.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  const donePoints = done.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);

  const start = startOfDay(sprint.startDate);
  const end = startOfDay(sprint.endDate);
  const today = startOfDay(new Date());
  const lastDay = today < end ? today : end;
  const totalDays = daysBetween(start, end) + 1;

  const days = Array.from({ length: totalDays }, (_, index) => {
    const day = addDays(start, index);
    if (day > lastDay) return null;
    const dayEnd = new Date(day.getTime() + MS_PER_DAY - 1);
    const remaining = sprint.tasks.filter(
      (task) =>
        task.createdAt <= dayEnd &&
        (!task.completedAt || task.completedAt > dayEnd),
    );
    return {
      date: dateKey(day),
      remainingTasks: remaining.length,
      remainingPoints: remaining.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      idealTasks:
        Math.round(
          (totalTasks * (totalDays - 1 - index)) / Math.max(1, totalDays - 1) * 10,
        ) / 10,
    };
  }).filter((day): day is NonNullable<typeof day> => day !== null);

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      project: sprint.project,
    },
    summary: {
      totalTasks,
      completedTasks: done.length,
      incompleteTasks: incomplete.length,
      totalPoints,
      completedPoints: donePoints,
      completionRate: totalTasks === 0 ? 0 : Math.round((done.length / totalTasks) * 1000) / 10,
      pointCompletionRate:
        totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 1000) / 10,
    },
    burndown: days,
    byColumn: sprint.tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.column.name] = (acc[task.column.name] ?? 0) + 1;
      return acc;
    }, {}),
    incomplete: incomplete.map((task) => ({
      id: task.id,
      number: task.number,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      column: task.column,
      assignees: task.assignments.map((assignment) => assignment.user),
    })),
    tasks: sprint.tasks.map((task) => ({
      id: task.id,
      number: task.number,
      title: task.title,
      priority: task.priority,
      storyPoints: task.storyPoints,
      completedAt: task.completedAt,
      column: task.column,
      assignees: task.assignments.map((assignment) => assignment.user),
    })),
  };
}
