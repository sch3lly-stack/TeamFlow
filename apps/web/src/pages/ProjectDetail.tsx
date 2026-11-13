import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Flag,
  FolderKanban,
  ListTodo,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { KanbanBoard } from "../components/KanbanBoard";
import { MilestonePanel } from "../components/MilestonePanel";
import { ProjectInsightsTab } from "../components/ProjectInsightsTab";
import { ProjectSettingsTab } from "../components/ProjectSettingsTab";
import { SprintPanel } from "../components/SprintPanel";
import { TaskDrawer } from "../components/TaskDrawer";
import { TaskModal } from "../components/TaskModal";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  EmptyState,
  Input,
  PageLoader,
  PriorityBadge,
  ProgressBar,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from "../components/ui";
import { api, queryString } from "../lib/api";
import type { Capability } from "../lib/permissions";
import type { OrgRole, Project, ProjectRole, Task, TaskCategory } from "../lib/types";
import { cn, formatDate, isOverdue } from "../lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";

type TabValue = "board" | "backlog" | "sprints" | "milestones" | "insights" | "settings";

type DetailResponse = {
  project: Project;
  permissions: string[];
  projectRole: ProjectRole | null;
  organizationRole: OrgRole;
};

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { orgId } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as TabValue) || "board";
  const taskId = searchParams.get("task");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [defaultColumnId, setDefaultColumnId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<DetailResponse>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  const { data: categoryData } = useQuery({
    queryKey: ["categories", orgId],
    queryFn: () => api<{ categories: TaskCategory[] }>(`/organizations/${orgId}/categories`),
    enabled: Boolean(orgId),
  });

  const permissions = useMemo(
    () => new Set((data?.permissions ?? []) as Capability[]),
    [data],
  );

  const { data: taskData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", projectId, { search, assigneeId, priority }],
    queryFn: () =>
      api<{ tasks: Task[] }>(
        `/projects/${projectId}/tasks${queryString({ q: search, assigneeId, priority })}`,
      ),
    enabled: Boolean(projectId),
  });

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete(key);
    else params.set(key, value);
    setSearchParams(params, { replace: true });
  }

  function openTask(id: string) {
    setParam("task", id);
  }

  function openCreate(columnId?: string) {
    setDefaultColumnId(columnId);
    setTaskModalOpen(true);
  }

  if (isLoading) return <PageLoader label="Loading project" />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={<FolderKanban className="h-5 w-5" />}
        title="Project not available"
        description="It may have been archived, or you may not have access."
        action={
          <Link to="/projects">
            <Button variant="outline" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to projects
            </Button>
          </Link>
        }
        className="mt-10"
      />
    );
  }

  const project = data.project;
  const columns = project.columns ?? [];
  const totalTasks = columns.reduce((sum, column) => sum + (column.taskCount ?? 0), 0);
  const doneTasks = columns
    .filter((column) => column.isDone)
    .reduce((sum, column) => sum + (column.taskCount ?? 0), 0);
  const progress = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
  const tasks = taskData?.tasks ?? [];
  const categories = categoryData?.categories ?? [];

  const tabs: { value: TabValue; label: string; count?: number }[] = [
    { value: "board", label: "Board" },
    { value: "backlog", label: "Backlog", count: totalTasks },
    { value: "sprints", label: "Sprints", count: project.sprints?.length ?? 0 },
    { value: "milestones", label: "Milestones", count: project.milestones?.length ?? 0 },
    { value: "insights", label: "Insights" },
    { value: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Projects
        </button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                style={{ backgroundColor: project.color }}
              >
                {project.key.slice(0, 3)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                    {project.name}
                  </h1>
                  <StatusBadge status={project.status} />
                  <PriorityBadge priority={project.priority} />
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {project.key} · {project.team?.name ?? "No team"}
                </p>
              </div>
            </div>
            {project.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {project.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {permissions.has("task:write") ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
                New task
              </Button>
            ) : null}
            {permissions.has("project:manage") ? (
              <Button variant="outline" icon={<Settings className="h-4 w-4" />} onClick={() => setParam("tab", "settings")}>
                Settings
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            {project.owner ? <Avatar name={project.owner.name} color={project.owner.avatarColor} size="xs" /> : null}
            {project.owner?.name ?? "No owner"}
          </span>
          {project.dueDate ? (
            <span className={cn("flex items-center gap-1", isOverdue(project.dueDate) && project.status !== "COMPLETED" && "text-red-500")}>
              <CalendarClock className="h-3.5 w-3.5" /> Due {formatDate(project.dueDate, "MMM d, yyyy")}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <ListTodo className="h-3.5 w-3.5" /> {doneTasks}/{totalTasks} tasks
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <AvatarStack users={(project.members ?? []).map((member) => member.user)} max={4} size="xs" />
          </span>
          <span className="flex min-w-[140px] items-center gap-2">
            <ProgressBar value={progress} size="sm" color={project.color} className="w-24" />
            <span className="text-[11px] font-semibold">{progress}%</span>
          </span>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(value) => setParam("tab", value)} />

      {tab === "board" ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter tasks…" className="pl-9" />
            </div>
            <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="sm:w-44">
              <option value="">Everyone</option>
              {(project.members ?? []).map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(event) => setPriority(event.target.value)} className="sm:w-36">
              <option value="">Any priority</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
            {(search || assigneeId || priority) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setAssigneeId("");
                  setPriority("");
                }}
              >
                Clear
              </Button>
            )}
            <span className="ml-auto text-xs text-slate-400">{tasks.length} tasks</span>
          </div>
          {tasksLoading ? (
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-64 w-[284px] shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800/50" />
              ))}
            </div>
          ) : (
            <KanbanBoard
              project={project}
              tasks={tasks}
              canWrite={permissions.has("task:write")}
              onOpenTask={openTask}
              onAddTask={(columnId) => openCreate(columnId)}
            />
          )}
        </div>
      ) : null}

      {tab === "backlog" ? (
        <Backlog
          project={project}
          tasks={tasks}
          loading={tasksLoading}
          canWrite={permissions.has("task:write")}
          onOpenTask={openTask}
          onAddTask={() => openCreate()}
        />
      ) : null}

      {tab === "sprints" ? (
        <SprintPanel project={project} canManage={permissions.has("sprint:manage")} onOpenTask={openTask} />
      ) : null}

      {tab === "milestones" ? (
        <MilestonePanel project={project} canManage={permissions.has("milestone:manage")} />
      ) : null}

      {tab === "insights" ? <ProjectInsightsTab project={project} /> : null}

      {tab === "settings" ? (
        <ProjectSettingsTab
          project={project}
          permissions={permissions}
          onArchived={() => navigate("/projects")}
        />
      ) : null}

      <TaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        project={project}
        categories={categories}
        defaultColumnId={defaultColumnId}
        onCreated={(task) => openTask(task.id)}
      />

      <TaskDrawer
        taskId={taskId}
        onClose={() => setParam("task", null)}
        project={project}
        categories={categories}
        permissions={permissions}
      />
    </div>
  );
}

function Backlog({
  project,
  tasks,
  loading,
  canWrite,
  onOpenTask,
  onAddTask,
}: {
  project: Project;
  tasks: Task[];
  loading: boolean;
  canWrite: boolean;
  onOpenTask: (id: string) => void;
  onAddTask: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const term = search.toLowerCase();
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(term) ||
        String(task.number).includes(term) ||
        (task.category?.name ?? "").toLowerCase().includes(term),
    );
  }, [tasks, search]);

  const sorted = [...filtered].sort((a, b) => {
    const priorityRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const diff = priorityRank[a.priority] - priorityRank[b.priority];
    if (diff !== 0) return diff;
    return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search backlog…" className="pl-9" />
        </div>
        <span className="text-xs text-slate-400">{sorted.length} tasks</span>
        {canWrite ? (
          <Button size="sm" variant="outline" className="ml-auto" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAddTask}>
            Add task
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="surface divide-y divide-slate-100 dark:divide-slate-800">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="p-3">
              <div className="skeleton h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-5 w-5" />}
          title="No tasks in the backlog"
          description="Create a task to start planning work."
          action={canWrite ? <Button size="sm" onClick={onAddTask}>Create task</Button> : null}
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="hidden grid-cols-[90px_1fr_120px_100px_160px_110px_60px] gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-ink-850/50 lg:grid">
            <span>Key</span>
            <span>Task</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Assignees</span>
            <span>Due</span>
            <span>Points</span>
          </div>
          {sorted.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task.id)}
              className="grid w-full grid-cols-[70px_1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition last:border-0 hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40 lg:grid-cols-[90px_1fr_120px_100px_160px_110px_60px]"
            >
              <span className="text-[11px] font-semibold text-slate-400">
                {project.key}-{task.number}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{task.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {task.category ? <Badge tone="neutral">{task.category.name}</Badge> : null}
                  {task.sprint ? <Badge tone="indigo">{task.sprint.name}</Badge> : null}
                  {task.dependencies && task.dependencies.length > 0 ? <Badge tone="amber">Blocked</Badge> : null}
                </span>
              </span>
              <span className="hidden lg:block">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", task.column.isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", task.column.isDone ? "bg-emerald-500" : "bg-slate-400")} />
                  {task.column.name}
                </span>
              </span>
              <span className="hidden lg:block"><PriorityBadge priority={task.priority} /></span>
              <span className="hidden lg:flex"><AvatarStack users={task.assignments.map((a) => a.user)} size="xs" max={3} /></span>
              <span className={cn("hidden text-xs lg:block", isOverdue(task.dueDate) && !task.column.isDone ? "text-red-500" : "text-slate-400")}>
                {formatDate(task.dueDate)}
              </span>
              <span className="hidden text-xs text-slate-400 lg:block">{task.storyPoints ?? "—"}</span>
              <span className="flex justify-end lg:hidden"><AvatarStack users={task.assignments.map((a) => a.user)} size="xs" max={2} /></span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-slate-400">
        <Flag className="h-3 w-3" /> Completed work stays visible here so history is never hidden.
      </div>
    </div>
  );
}
