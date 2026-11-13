import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Users } from "lucide-react";
import { Link } from "react-router-dom";
import {
  CompletionTrendChart,
  PriorityDonut,
  SimpleProjectStatusChart,
  ThroughputChart,
  VelocityChart,
} from "../components/charts";
import { Avatar, Badge, PageHeader, PageLoader, ProgressBar, StatCard } from "../components/ui";
import { api } from "../lib/api";
import type { OrgAnalytics } from "../lib/types";
import { formatDate } from "../lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function AnalyticsPage() {
  const { orgId } = useWorkspace();
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", orgId],
    queryFn: () => api<OrgAnalytics>(`/organizations/${orgId}/analytics?weeks=8`),
    enabled: Boolean(orgId),
  });

  if (isLoading || !data) return <PageLoader label="Building analytics" />;

  const velocity = data.velocity.map((sprint) => ({
    name: sprint.name.replace(/^.*Sprint\s*/i, "S"),
    completedTasks: sprint.completedTasks,
    completedPoints: sprint.completedPoints,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery analytics"
        description="Throughput, completion and load across the organization. Signals are for planning, not individual scoring."
        actions={
          <Link to="/workload">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60">
              <Users className="h-4 w-4" /> Workload
            </span>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Completion" value={`${data.kpis.completionRate}%`} hint={`${data.kpis.completedTasks} of ${data.kpis.openTasks + data.kpis.completedTasks} tasks`} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Cycle time" value={`${data.kpis.avgCycleTimeDays}d`} hint="Average for completed work" icon={<Clock3 className="h-4 w-4" />} />
        <StatCard label="Throughput" value={data.throughput.reduce((sum, week) => sum + week.completed, 0)} hint="Completed in 8 weeks" icon={<Activity className="h-4 w-4" />} />
        <StatCard label="On-time rate" value={`${data.kpis.onTimeRate}%`} hint="Completed by due date" />
        <StatCard label="Overdue" value={data.kpis.overdueTasks} hint="Open tasks past due" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Completion trend</h2>
            <Badge tone="indigo">Last 14 days</Badge>
          </div>
          <CompletionTrendChart data={data.completionTrend} height={220} />
        </div>
        <div className="surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Open work by priority</h2>
          <PriorityDonut data={data.priorityDistribution} height={220} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Created vs completed</h2>
          <ThroughputChart data={data.throughput} height={230} />
        </div>
        <div className="surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Sprint velocity</h2>
          <VelocityChart data={velocity} height={230} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Projects by status</h2>
          <SimpleProjectStatusChart data={data.projectStatus} />
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Active sprints</h2>
            <Badge tone="green">{data.activeSprints.length}</Badge>
          </div>
          {data.activeSprints.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No active sprints</p>
          ) : (
            <div className="space-y-3">
              {data.activeSprints.map((sprint) => (
                <div key={sprint.id}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{sprint.name}</span>
                    <span className="text-slate-400">{sprint.progress}%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {sprint.project.name} · ends {formatDate(sprint.endDate)}
                  </p>
                  <ProgressBar value={sprint.progress} size="sm" className="mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Planning load</h2>
            <Link to="/workload" className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              View details
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.workload.members.slice(0, 5).map((member) => (
              <div key={member.userId} className="flex items-center gap-2">
                <Avatar name={member.name} color={member.avatarColor} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600 dark:text-slate-300">{member.name}</span>
                <span className="text-[10px] text-slate-400">{member.openTasks} open</span>
                <span className="w-10 text-right text-[10px] font-medium text-slate-500">{member.estimatedHours}h</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-400 dark:border-slate-800">
            {data.workload.totals.overloadedMembers} members above the planning threshold.
          </p>
        </div>
      </div>

      <div className="surface flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent delivery activity</h2>
          <p className="text-xs text-slate-400">A human-readable trail of changes across projects.</p>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-slate-400">
          <ArrowUpRight className="h-3 w-3" /> {data.note}
        </span>
      </div>

      <div className="surface divide-y divide-slate-100 dark:divide-slate-800">
        {data.recentActivity.slice(0, 8).map((activity) => (
          <div key={activity.id} className="flex items-center gap-2.5 px-4 py-2.5">
            {activity.actor ? <Avatar name={activity.actor.name} color={activity.actor.avatarColor} size="xs" /> : null}
            <p className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{activity.actor?.name ?? "System"}</span>{" "}
              {activity.action.replace(".", " ")}
              {typeof activity.metadata?.title === "string" ? ` · ${activity.metadata.title}` : ""}
            </p>
            <span className="shrink-0 text-[10px] text-slate-400">{formatDate(activity.createdAt, "MMM d")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
