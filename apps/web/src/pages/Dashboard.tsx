import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListTodo,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CompletionTrendChart } from "../components/charts";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  MenuItem,
  PageHeader,
  PageLoader,
  ProgressBar,
  Skeleton,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { api } from "../lib/api";
import type { Activity, OrgDashboard } from "../lib/types";
import { cn, formatDate, humanize, isOverdue, relativeTime } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";

const WIDGETS = [
  { key: "sprints", label: "Active sprints" },
  { key: "trend", label: "Completion trend" },
  { key: "workload", label: "Workload snapshot" },
  { key: "milestones", label: "Upcoming milestones" },
  { key: "activity", label: "Recent activity" },
  { key: "projects", label: "Project health" },
] as const;

type WidgetKey = (typeof WIDGETS)[number]["key"];

function activityText(activity: Activity): string {
  const metadata = activity.metadata ?? {};
  const title = typeof metadata.title === "string" ? metadata.title : typeof metadata.name === "string" ? metadata.name : null;
  switch (activity.action) {
    case "task.created":
      return `created ${title ?? "a task"}`;
    case "task.moved":
      return `moved ${title ?? "a task"}${metadata.from && metadata.to ? ` from ${metadata.from} to ${metadata.to}` : ""}`;
    case "task.updated":
      return `updated ${title ?? "a task"}`;
    case "task.deleted":
      return `deleted ${title ?? "a task"}`;
    case "comment.created":
      return `commented on ${metadata.task ?? title ?? "a task"}`;
    case "sprint.created":
      return `created sprint ${title ?? ""}`;
    case "sprint.started":
      return `started sprint ${title ?? ""}`;
    case "sprint.completed":
      return `completed sprint ${title ?? ""}`;
    case "project.created":
      return `created project ${title ?? ""}`;
    case "project.updated":
      return `updated project ${title ?? ""}`;
    case "milestone.created":
      return `added milestone ${title ?? ""}`;
    case "member.updated":
      return `updated a member role`;
    case "invitation.created":
      return `invited a teammate`;
    default:
      return humanize(activity.action.replace(".", " "));
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const { orgId, membership, can } = useWorkspace();
  const [widgets, setWidgets] = useState<WidgetKey[]>(() => {
    try {
      const stored = localStorage.getItem("tf_dashboard_widgets");
      return stored ? (JSON.parse(stored) as WidgetKey[]) : WIDGETS.map((widget) => widget.key);
    } catch {
      return WIDGETS.map((widget) => widget.key);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("tf_dashboard_widgets", JSON.stringify(widgets));
    } catch {
      // ignore storage errors
    }
  }, [widgets]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", orgId],
    queryFn: () => api<OrgDashboard>(`/organizations/${orgId}/dashboard`),
    enabled: Boolean(orgId),
  });

  function toggleWidget(key: WidgetKey) {
    setWidgets((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  if (isLoading || !data) return <PageLoader label="Loading your workspace" />;

  const { kpis } = data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const visible = (key: WidgetKey) => widgets.includes(key);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={membership?.organization.name}
        title={`${greeting}, ${user?.name.split(" ")[0] ?? "there"}`}
        description="Here is the delivery picture across your organization today."
        actions={
          <>
            <Dropdown
              trigger={
                <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800/60">
                  <Settings2 className="h-4 w-4" /> Customize
                </span>
              }
            >
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Dashboard widgets
              </div>
              {WIDGETS.map((widget) => (
                <MenuItem key={widget.key} onClick={() => toggleWidget(widget.key)} active={visible(widget.key)}>
                  {widget.label}
                </MenuItem>
              ))}
            </Dropdown>
            {can("project:create") ? (
              <Link to="/projects?new=1">
                <Button icon={<Sparkles className="h-4 w-4" />}>New project</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Active projects" value={kpis.activeProjects} hint={`${kpis.totalProjects} projects total`} icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Open tasks" value={kpis.openTasks} hint={`${kpis.completedTasks} completed`} icon={<ListTodo className="h-4 w-4" />} />
        <StatCard label="Completion" value={`${kpis.completionRate}%`} hint="All-time task completion" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard
          label="Overdue"
          value={kpis.overdueTasks}
          hint={kpis.overdueTasks > 0 ? "Needs attention" : "Nothing overdue"}
          icon={<AlertTriangle className={kpis.overdueTasks > 0 ? "h-4 w-4 text-amber-500" : "h-4 w-4"} />}
        />
        <StatCard label="Cycle time" value={`${kpis.avgCycleTimeDays}d`} hint="Average for completed work" icon={<Clock3 className="h-4 w-4" />} />
        <StatCard label="Team" value={kpis.members} hint={`${kpis.activeSprints} active sprints`} icon={<Users className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {visible("sprints") ? (
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Active sprints</h2>
              <Link to="/analytics" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Delivery analytics
              </Link>
            </div>
            {data.activeSprints.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="No active sprints"
                description="Start a sprint from a project to track progress here."
                className="bg-white/50 py-9 dark:bg-ink-900/40"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.activeSprints.map((sprint) => (
                  <Link
                    key={sprint.id}
                    to={`/projects/${sprint.project.id}?tab=sprints`}
                    className="surface block p-4 transition hover:border-indigo-300 dark:hover:border-indigo-500/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{sprint.name}</p>
                        <p className="truncate text-xs text-slate-400">{sprint.project.name}</p>
                      </div>
                      <Badge tone="green">Active</Badge>
                    </div>
                    <div className="mt-4 flex items-baseline justify-between text-xs">
                      <span className="text-slate-400">
                        {sprint.completedTasks}/{sprint.totalTasks} tasks
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{sprint.progress}%</span>
                    </div>
                    <ProgressBar value={sprint.progress} className="mt-1.5" />
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {visible("workload") ? (
          <div className="surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Workload snapshot</h2>
              <Link to="/workload" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Details
              </Link>
            </div>
            {data.workload.members.length === 0 ? (
              <p className="py-9 text-center text-xs text-slate-400">No members yet</p>
            ) : (
              <div className="mt-3 space-y-3">
                {data.workload.members.slice(0, 5).map((member) => (
                  <div key={member.userId}>
                    <div className="flex items-center gap-2">
                      <Avatar name={member.name} color={member.avatarColor} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                        {member.name}
                      </span>
                      <span className={cn("text-[11px] font-semibold", member.overloaded ? "text-amber-600 dark:text-amber-400" : "text-slate-400")}>
                        {member.openTasks} open
                      </span>
                    </div>
                    <ProgressBar
                      value={Math.min(100, (member.estimatedHours / data.workload.thresholds.estimatedHours) * 100)}
                      size="sm"
                      className="mt-1.5"
                      color={member.overloaded ? "#f59e0b" : undefined}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-400 dark:border-slate-800">
              Workload is a planning aid based on assigned open work and estimates — not a performance score.
            </p>
          </div>
        ) : null}
      </div>

      {visible("trend") ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="surface p-4 lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Completion trend</h2>
                <p className="text-xs text-slate-400">Tasks completed over the last 14 days</p>
              </div>
              <Badge tone="indigo">{kpis.completedInRange} in range</Badge>
            </div>
            <CompletionTrendChart data={data.completionTrend} />
          </div>
          <div className="surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">On-time delivery</h2>
              <Badge tone={kpis.onTimeRate >= 80 ? "green" : "amber"}>{kpis.onTimeRate}%</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Share of completed tasks with a due date that finished on or before that date.
            </p>
            <div className="mt-5 flex h-24 items-end gap-1.5">
              {data.completionTrend.slice(-10).map((point) => {
                const max = Math.max(1, ...data.completionTrend.map((entry) => entry.completed));
                return (
                  <div key={point.date} className="flex-1 rounded-t bg-indigo-500/80" style={{ height: `${Math.max(6, (point.completed / max) * 100)}%` }} title={`${point.date}: ${point.completed}`} />
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-slate-400">Daily completed tasks, most recent on the right</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {visible("milestones") ? (
          <div className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Upcoming milestones</h2>
              <CalendarClock className="h-4 w-4 text-slate-400" />
            </div>
            {data.upcomingMilestones.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No upcoming milestones</p>
            ) : (
              <div className="space-y-3">
                {data.upcomingMilestones.map((milestone) => (
                  <div key={milestone.id} className="flex items-start gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: milestone.project.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{milestone.name}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {milestone.project.key} · {formatDate(milestone.dueDate)}
                      </p>
                    </div>
                    <StatusBadge status={milestone.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {visible("activity") ? (
          <div className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent activity</h2>
              <ActivityIcon className="h-4 w-4 text-slate-400" />
            </div>
            {data.recentActivity.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {data.recentActivity.slice(0, 6).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-2.5">
                    {activity.actor ? (
                      <Avatar name={activity.actor.name} color={activity.actor.avatarColor} size="xs" />
                    ) : (
                      <span className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {activity.actor?.name ?? "System"}
                        </span>{" "}
                        {activityText(activity)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {activity.project ? `${activity.project.key} · ` : ""}
                        {relativeTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {visible("projects") ? (
          <div className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Project health</h2>
              <Link to="/projects" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                View all
              </Link>
            </div>
            {data.projects.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No projects yet</p>
            ) : (
              <div className="space-y-3.5">
                {data.projects.slice(0, 4).map((project) => (
                  <Link key={project.id} to={`/projects/${project.id}`} className="block group">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-300">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                        {project.name}
                      </span>
                      <span className="text-[10px] text-slate-400">{project._count?.tasks ?? 0} tasks</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProgressBar value={project.progress} size="sm" color={project.color} />
                      <span className="w-8 text-right text-[10px] font-medium text-slate-400">{project.progress}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <p className="flex items-center gap-1.5 pb-2 text-[10px] text-slate-400">
        <ArrowUpRight className="h-3 w-3" />
        {data.note}
      </p>
    </div>
  );
}
