import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, ListTodo, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AvatarStack,
  Badge,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  PriorityBadge,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { api } from "../lib/api";
import type { MyWorkResponse, Task } from "../lib/types";
import { cn, formatDate, isOverdue } from "../lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";

type GroupKey = "overdue" | "week" | "open" | "done";

function groupTasks(tasks: Task[]): Record<GroupKey, Task[]> {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const groups: Record<GroupKey, Task[]> = { overdue: [], week: [], open: [], done: [] };
  for (const task of tasks) {
    if (task.column.isDone) groups.done.push(task);
    else if (task.dueDate && new Date(task.dueDate) < now) groups.overdue.push(task);
    else if (task.dueDate && new Date(task.dueDate) <= weekEnd) groups.week.push(task);
    else groups.open.push(task);
  }
  return groups;
}

function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600"
        aria-hidden="true"
      >
        {task.column.isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold text-slate-400">
            {task.project?.key}-{task.number}
          </span>
          <span className={cn("truncate text-xs font-medium text-slate-800 dark:text-slate-100", task.column.isDone && "line-through opacity-60")}>
            {task.title}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{task.project?.name}</span>
          {task.sprint ? <Badge tone="indigo">{task.sprint.name}</Badge> : null}
          <span className="text-[10px] text-slate-400">{task.column.name}</span>
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-2 sm:flex">
        <PriorityBadge priority={task.priority} />
        <span className={cn("text-[11px]", isOverdue(task.dueDate) && !task.column.isDone ? "font-medium text-red-500" : "text-slate-400")}>
          {task.dueDate ? formatDate(task.dueDate) : "No date"}
        </span>
        <AvatarStack users={task.assignments.map((assignment) => assignment.user)} size="xs" max={2} />
      </span>
    </button>
  );
}

export function MyWorkPage() {
  const { orgId } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mywork", orgId],
    queryFn: () => api<MyWorkResponse>(`/organizations/${orgId}/my-work`),
    enabled: Boolean(orgId),
  });

  const groups = useMemo(() => {
    const tasks = (data?.tasks ?? []).filter((task) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return task.title.toLowerCase().includes(term) || (task.project?.name ?? "").toLowerCase().includes(term);
    });
    return groupTasks(tasks);
  }, [data, search]);

  if (isLoading || !data) return <PageLoader label="Loading your work" />;

  const openTask = (task: Task) => navigate(`/projects/${task.projectId}?task=${task.id}`);

  const sections: { key: GroupKey; label: string; icon: React.ReactNode; tasks: Task[] }[] = [
    { key: "overdue", label: "Overdue", icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />, tasks: groups.overdue },
    { key: "week", label: "Due this week", icon: <CalendarClock className="h-3.5 w-3.5 text-amber-500" />, tasks: groups.week },
    { key: "open", label: "Other open work", icon: <ListTodo className="h-3.5 w-3.5 text-slate-400" />, tasks: groups.open },
    ...(showDone ? [{ key: "done" as GroupKey, label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />, tasks: groups.done }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="My work"
        description="Everything assigned to you across projects, grouped by delivery pressure."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assigned" value={data.summary.total} hint="Open and completed" />
        <StatCard label="Open" value={data.summary.open} hint={`${data.summary.completed} completed`} />
        <StatCard label="Overdue" value={data.summary.overdue} hint={data.summary.overdue ? "Needs attention" : "All clear"} />
        <StatCard label="Due this week" value={data.summary.dueThisWeek} hint="Next seven days" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your work…" className="pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setShowDone((value) => !value)}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {showDone ? "Hide completed" : `Show completed (${data.summary.completed})`}
        </button>
      </div>

      {data.summary.total === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="No tasks assigned to you"
          description="When tasks are assigned to you, they will show up here."
        />
      ) : (
        <div className="space-y-4">
          {sections
            .filter((section) => section.tasks.length > 0)
            .map((section) => (
              <div key={section.key} className="surface overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-2 dark:border-slate-800 dark:bg-ink-850/40">
                  {section.icon}
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{section.label}</h2>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:bg-slate-800">{section.tasks.length}</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {section.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} onOpen={() => openTask(task)} />
                  ))}
                </div>
              </div>
            ))}
          {sections.every((section) => section.tasks.length === 0) ? (
            <EmptyState title="No matching tasks" description="Try a different search term." />
          ) : null}
        </div>
      )}
    </div>
  );
}
