import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import type { Project, ProjectAnalytics } from "../lib/types";
import { AssigneeChart, CompletionTrendChart, PriorityDonut, ThroughputChart, VelocityChart } from "./charts";
import { Button, StatCard } from "./ui";

export function ProjectInsightsTab({ project }: { project: Project }) {
  const { data, isLoading } = useQuery({
    queryKey: ["projectAnalytics", project.id],
    queryFn: () => api<ProjectAnalytics>(`/projects/${project.id}/analytics`),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-24" />
        ))}
      </div>
    );
  }

  const velocity = data.sprints
    .filter((sprint) => sprint.status === "COMPLETED")
    .map((sprint) => ({
      name: sprint.name,
      completedTasks: sprint.completedTasks,
      completedPoints: sprint.completedPoints,
    }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Project insights</h2>
          <p className="text-xs text-slate-400">Flow, load and delivery signals for this project.</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => void downloadFile(`/projects/${project.id}/report?format=csv`, `teamflow-${project.key.toLowerCase()}-report.csv`)}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<FileText className="h-3.5 w-3.5" />}
            onClick={() => void downloadFile(`/projects/${project.id}/report?format=json`, `teamflow-${project.key.toLowerCase()}-report.json`)}
          >
            JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completion" value={`${data.kpis.completionRate}%`} hint={`${data.kpis.completedTasks} of ${data.kpis.totalTasks} tasks`} />
        <StatCard label="Open tasks" value={data.kpis.openTasks} hint={`${data.kpis.unassignedTasks} unassigned`} />
        <StatCard label="Overdue" value={data.kpis.overdueTasks} hint={data.kpis.overdueTasks ? "Review due dates" : "All clear"} />
        <StatCard label="Avg cycle time" value={`${data.kpis.avgCycleTimeDays}d`} hint="Creation to completion" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Completions · last 14 days</h3>
          <CompletionTrendChart data={data.completionTrend} />
        </div>
        <div className="surface p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Open work by priority</h3>
          <PriorityDonut data={data.byPriority} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Created vs completed · 8 weeks</h3>
          <ThroughputChart data={data.throughput} />
        </div>
        <div className="surface p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Work distribution</h3>
          <AssigneeChart data={data.byAssignee} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Sprint velocity (completed points)</h3>
          <VelocityChart data={velocity} />
        </div>
        <div className="surface p-4">
          <h3 className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-200">Delivery signals</h3>
          <dl className="space-y-2 text-xs">
            {[
              ["Story points", `${data.kpis.completedPoints} / ${data.kpis.totalPoints}`],
              ["Open sprints", String(data.sprints.filter((sprint) => sprint.status === "ACTIVE").length)],
              ["Milestones", String(data.milestones.length)],
              ["Project status", project.status.toLowerCase()],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-4 text-slate-400">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
            {data.note}
          </p>
        </div>
      </div>
    </div>
  );
}
