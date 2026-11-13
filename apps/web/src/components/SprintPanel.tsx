import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Flag,
  ListChecks,
  Play,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Project, Sprint, SprintReport, Task } from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import { useToast } from "../providers/ToastProvider";
import { BurndownChart } from "./charts";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  StatusBadge,
  Textarea,
} from "./ui";

function today(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function SprintPanel({
  project,
  canManage,
  onOpenTask,
}: {
  project: Project;
  canManage: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addTasksOpen, setAddTasksOpen] = useState(false);
  const [carryOpen, setCarryOpen] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today(14));
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [carryTarget, setCarryTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: sprintData, isLoading } = useQuery({
    queryKey: ["sprints", project.id],
    queryFn: () => api<{ sprints: Sprint[] }>(`/projects/${project.id}/sprints`),
  });

  const sprints = useMemo(() => sprintData?.sprints ?? [], [sprintData]);

  useEffect(() => {
    if (sprints.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !sprints.some((sprint) => sprint.id === selectedId)) {
      setSelectedId(
        sprints.find((sprint) => sprint.status === "ACTIVE")?.id ??
          sprints.find((sprint) => sprint.status === "PLANNED")?.id ??
          sprints[0]!.id,
      );
    }
  }, [sprints, selectedId]);

  const selected = sprints.find((sprint) => sprint.id === selectedId) ?? null;

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["sprint", selectedId, "report"],
    queryFn: () => api<SprintReport>(`/sprints/${selectedId}/report`),
    enabled: Boolean(selectedId),
  });

  const { data: taskData } = useQuery({
    queryKey: ["tasks", project.id, "all"],
    queryFn: () => api<{ tasks: Task[] }>(`/projects/${project.id}/tasks`),
    enabled: addTasksOpen,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["sprints", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["sprint"] });
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["tasks", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ sprint: Sprint }>(`/projects/${project.id}/sprints`, {
        method: "POST",
        body: { name, goal: goal.trim() || null, startDate, endDate },
      }),
    onSuccess: (response) => {
      refresh();
      setCreateOpen(false);
      setName("");
      setGoal("");
      setStartDate(today());
      setEndDate(today(14));
      setSelectedId(response.sprint.id);
      push("Sprint created", { message: response.sprint.name, tone: "success" });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not create sprint"),
  });

  const action = useMutation({
    mutationFn: (input: { path: string; body?: unknown; method?: string }) =>
      api(input.path, { method: input.method ?? "POST", body: input.body }),
    onSuccess: () => refresh(),
    onError: (caught) =>
      push("Sprint action failed", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const carries = useMutation({
    mutationFn: () =>
      api(`/sprints/${selectedId}/carry-over`, {
        method: "POST",
        body: { targetSprintId: carryTarget || null },
      }),
    onSuccess: (result) => {
      const moved = (result as { moved?: number })?.moved ?? 0;
      push("Incomplete work moved", { message: `${moved} tasks carried over.`, tone: "success" });
      setCarryOpen(false);
      setCarryTarget("");
      refresh();
    },
    onError: (caught) =>
      push("Carry-over failed", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const addTasks = useMutation({
    mutationFn: () =>
      api(`/sprints/${selectedId}/tasks`, {
        method: "POST",
        body: { taskIds: selectedTaskIds },
      }),
    onSuccess: () => {
      push("Tasks added to sprint", { tone: "success" });
      setAddTasksOpen(false);
      setSelectedTaskIds([]);
      refresh();
    },
    onError: (caught) =>
      push("Could not add tasks", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const availableTasks = (taskData?.tasks ?? []).filter(
    (task) => !(report?.tasks ?? []).some((reportTask) => reportTask.id === task.id),
  );

  function createSprint(event: FormEvent) {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Sprints</h2>
          <p className="text-xs text-slate-400">Plan, run and review delivery cycles.</p>
        </div>
        {canManage ? (
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New sprint
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="skeleton h-64 w-full" />
      ) : sprints.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="No sprints yet"
          description="Create a sprint to group work, set an objective and track a burndown."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Create sprint
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {sprints.map((sprint) => {
              const isSelected = sprint.id === selectedId;
              return (
                <button
                  key={sprint.id}
                  type="button"
                  onClick={() => setSelectedId(sprint.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    isSelected
                      ? "border-indigo-400 bg-indigo-50/50 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-ink-900 dark:hover:border-slate-700",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{sprint.name}</span>
                    <StatusBadge status={sprint.status} />
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{sprint.goal || "No sprint goal"}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
                    </span>
                    <span>{sprint.stats?.progress ?? 0}%</span>
                  </div>
                  <ProgressBar value={sprint.stats?.progress ?? 0} size="sm" className="mt-1.5" />
                </button>
              );
            })}
          </div>

          <div className="surface min-w-0 p-4">
            {reportLoading || !report ? (
              <div className="space-y-2">
                <div className="skeleton h-6 w-1/2" />
                <div className="skeleton h-32 w-full" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex activity-center flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{report.sprint.name}</h3>
                      <StatusBadge status={report.sprint.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDate(report.sprint.startDate, "MMM d")} → {formatDate(report.sprint.endDate, "MMM d, yyyy")}
                      {report.sprint.goal ? ` · ${report.sprint.goal}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-1.5">
                      {report.sprint.status === "PLANNED" ? (
                        <Button
                          size="sm"
                          icon={<Play className="h-3.5 w-3.5" />}
                          loading={action.isPending}
                          onClick={() => action.mutate({ path: `/sprints/${report.sprint.id}/start` })}
                        >
                          Start sprint
                        </Button>
                      ) : null}
                      {report.sprint.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => setConfirmComplete(true)}
                        >
                          Complete
                        </Button>
                      ) : null}
                      {report.sprint.status !== "COMPLETED" ? (
                        <>
                          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddTasksOpen(true)}>
                            Add tasks
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => setCarryOpen(true)}>
                            Carry over
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Tasks", `${report.summary.completedTasks}/${report.summary.totalTasks}`],
                    ["Completion", `${report.summary.completionRate}%`],
                    ["Points", `${report.summary.completedPoints}/${report.summary.totalPoints}`],
                    ["Incomplete", String(report.summary.incompleteTasks)],
                  ].map(([label, value]) => (
                    <div key={label} className="surface-muted px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                      <p className="mt-0.5 text-base font-semibold text-slate-800 dark:text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Burndown</h4>
                    <Badge tone="indigo">Remaining vs ideal</Badge>
                  </div>
                  {report.burndown.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">The sprint has not started yet.</p>
                  ) : (
                    <BurndownChart data={report.burndown} />
                  )}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <Flag className="h-3.5 w-3.5" /> Incomplete work
                    </h4>
                    {report.incomplete.length === 0 ? (
                      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Everything in this sprint is complete.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {report.incomplete.slice(0, 8).map((task) => (
                          <div key={task.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <button
                              type="button"
                              onClick={() => onOpenTask(task.id)}
                              className="min-w-0 flex-1 truncate text-left text-[11px] text-slate-600 dark:text-slate-300"
                            >
                              <span className="mr-1.5 font-semibold text-slate-400">{project.key}-{task.number}</span>
                              {task.title}
                            </button>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm("Remove this task from the sprint?")) {
                                    action.mutate({ path: `/sprints/${report.sprint.id}/tasks/${task.id}`, method: "DELETE" });
                                  }
                                }}
                                className="rounded p-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                                aria-label="Remove task from sprint"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <ListChecks className="h-3.5 w-3.5" /> Flow by column
                    </h4>
                    <div className="space-y-1.5">
                      {Object.entries(report.byColumn).map(([column, count]) => (
                        <div key={column} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">{column}</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{count}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTaskIds([])}
                      className="mt-3 hidden"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create sprint"
        description="Set a focused objective and a realistic timebox."
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Create sprint
            </Button>
          </>
        }
      >
        <form onSubmit={createSprint} className="space-y-4">
          <Field label="Sprint name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} placeholder="Atlas Sprint 13" autoFocus />
          </Field>
          <Field label="Sprint goal">
            <Textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={2} placeholder="What outcome should this sprint produce?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" required>
              <Input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="End date" required>
              <Input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
          </div>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>

      <Modal
        open={addTasksOpen}
        onClose={() => setAddTasksOpen(false)}
        title="Add tasks to sprint"
        description="Only tasks not already in this sprint are shown."
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddTasksOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedTaskIds.length === 0}
              loading={addTasks.isPending}
              onClick={() => addTasks.mutate()}
            >
              Add {selectedTaskIds.length || ""} tasks
            </Button>
          </>
        }
      >
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {availableTasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">All project tasks are already in this sprint.</p>
          ) : (
            availableTasks.map((task) => {
              const checked = selectedTaskIds.includes(task.id);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    setSelectedTaskIds((current) =>
                      current.includes(task.id)
                        ? current.filter((id) => id !== task.id)
                        : [...current, task.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition",
                    checked
                      ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border",
                      checked ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 dark:border-slate-600",
                    )}
                  >
                    {checked ? <CheckCircle2 className="h-3 w-3" /> : null}
                  </span>
                  <span className="w-14 shrink-0 font-semibold text-slate-400">{project.key}-{task.number}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{task.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{task.column.name}</span>
                </button>
              );
            })
          )}
        </div>
      </Modal>

      <Modal
        open={carryOpen}
        onClose={() => setCarryOpen(false)}
        title="Carry over incomplete work"
        description="Move unfinished tasks into another sprint or back to the backlog."
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCarryOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={carries.isPending} onClick={() => carries.mutate()}>
              Move incomplete work
            </Button>
          </>
        }
      >
        <Field label="Destination">
          <Select value={carryTarget} onChange={(event) => setCarryTarget(event.target.value)}>
            <option value="">Backlog</option>
            {sprints
              .filter((sprint) => sprint.id !== selectedId && sprint.status !== "COMPLETED")
              .map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => {
          action.mutate(
            { path: `/sprints/${selectedId}/complete` },
            {
              onSuccess: () => {
                setConfirmComplete(false);
                push("Sprint completed", { tone: "success" });
              },
            },
          );
        }}
        title="Complete this sprint?"
        description="Incomplete tasks stay attached to the sprint so reports remain accurate. Carry them over when ready."
        confirmLabel="Complete sprint"
        loading={action.isPending}
        danger={false}
      />
    </div>
  );
}
