import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BriefcaseBusiness, Clock3, Info, Users } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Badge,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  Select,
  StatCard,
} from "../components/ui";
import { api } from "../lib/api";
import type { Team, WorkloadResponse } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function WorkloadPage() {
  const { orgId } = useWorkspace();
  const [teamId, setTeamId] = useState("");

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api<{ teams: Team[] }>(`/organizations/${orgId}/teams`),
    enabled: Boolean(orgId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["workload", orgId, teamId],
    queryFn: () =>
      api<WorkloadResponse>(`/organizations/${orgId}/workload${teamId ? `?teamId=${teamId}` : ""}`),
    enabled: Boolean(orgId),
  });

  if (isLoading || !data) return <PageLoader label="Calculating workload" />;

  const maxHours = Math.max(data.thresholds.estimatedHours, ...data.members.map((member) => member.estimatedHours), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team workload"
        description="See how open work and estimates are distributed so you can rebalance before people burn out."
        actions={
          <Select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="w-48">
            <option value="">All teams</option>
            {(teamsData?.teams ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Members" value={data.totals.members} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Open assignments" value={data.totals.openTasks} icon={<BriefcaseBusiness className="h-4 w-4" />} />
        <StatCard label="Estimated hours" value={`${data.totals.estimatedHours}h`} icon={<Clock3 className="h-4 w-4" />} />
        <StatCard
          label="Overloaded"
          value={data.totals.overloadedMembers}
          hint={`Threshold: ${data.thresholds.openTasks} tasks or ${data.thresholds.estimatedHours}h`}
          icon={<AlertTriangle className={data.totals.overloadedMembers ? "h-4 w-4 text-amber-500" : "h-4 w-4"} />}
        />
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 text-xs leading-5 text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/5 dark:text-indigo-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{data.note} Estimates are self-reported and may be missing for some tasks.</p>
      </div>

      {data.unassignedOpenTasks > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          {data.unassignedOpenTasks} open {data.unassignedOpenTasks === 1 ? "task is" : "tasks are"} unassigned and not included below.
        </div>
      ) : null}

      {data.members.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title="No members" description="Invite teammates to see their workload." />
      ) : (
        <div className="surface overflow-hidden">
          <div className="hidden grid-cols-[220px_1fr_150px_100px_90px] gap-4 border-b border-slate-200 bg-slate-50/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:grid dark:border-slate-800 dark:bg-ink-850/40">
            <span>Member</span>
            <span>Assigned work</span>
            <span>Estimate</span>
            <span>Overdue</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {data.members.map((member) => (
              <div key={member.userId} className="grid grid-cols-1 gap-3 px-4 py-3.5 lg:grid-cols-[220px_1fr_150px_100px_90px] lg:items-center lg:gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={member.name} color={member.avatarColor} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{member.name}</p>
                    <p className="truncate text-[10px] text-slate-400">
                      {member.title ?? member.role.toLowerCase().replace("_", " ")}
                      {member.department ? ` · ${member.department}` : ""}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{member.openTasks} open tasks</span>
                    <span>{member.urgentTasks} urgent/high</span>
                  </div>
                  <ProgressBar
                    value={Math.min(100, (member.openTasks / data.thresholds.openTasks) * 100)}
                    size="sm"
                    className="mt-1.5"
                    color={member.overloaded ? "#f59e0b" : undefined}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{member.estimatedHours}h</span>
                    <span>{Math.round((member.estimatedHours / maxHours) * 100)}%</span>
                  </div>
                  <ProgressBar
                    value={(member.estimatedHours / maxHours) * 100}
                    size="sm"
                    className="mt-1.5"
                    color={member.estimatedHours >= data.thresholds.estimatedHours ? "#ef4444" : "#6366f1"}
                  />
                </div>

                <div className={cn("text-xs font-medium", member.overdueTasks > 0 ? "text-red-500" : "text-slate-400")}>
                  {member.overdueTasks} overdue
                </div>

                <div>
                  {member.overloaded ? <Badge tone="amber">High load</Badge> : <Badge tone="green">Balanced</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
