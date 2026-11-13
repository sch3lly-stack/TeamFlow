import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Flag, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Milestone, MilestoneStatus, Project } from "../lib/types";
import { cn, formatDate, isOverdue } from "../lib/utils";
import { useToast } from "../providers/ToastProvider";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "./ui";

const emptyForm = {
  name: "",
  description: "",
  dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
  status: "PENDING" as MilestoneStatus,
};

export function MilestonePanel({ project, canManage }: { project: Project; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["milestones", project.id],
    queryFn: () => api<{ milestones: Milestone[] }>(`/projects/${project.id}/milestones`),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["milestones", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        description: form.description.trim() || null,
        dueDate: form.dueDate,
        status: form.status,
      };
      return editing
        ? api(`/projects/${project.id}/milestones/${editing.id}`, { method: "PATCH", body })
        : api(`/projects/${project.id}/milestones`, { method: "POST", body });
    },
    onSuccess: () => {
      refresh();
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      push(editing ? "Milestone updated" : "Milestone created", { tone: "success" });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not save milestone"),
  });

  const toggleMutation = useMutation({
    mutationFn: (milestone: Milestone) =>
      api(`/projects/${project.id}/milestones/${milestone.id}`, {
        method: "PATCH",
        body: { status: milestone.status === "COMPLETED" ? "PENDING" : "COMPLETED" },
      }),
    onSuccess: () => refresh(),
    onError: (caught) =>
      push("Could not update milestone", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (milestoneId: string) =>
      api(`/projects/${project.id}/milestones/${milestoneId}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      push("Milestone deleted", { tone: "success" });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(milestone: Milestone) {
    setEditing(milestone);
    setForm({
      name: milestone.name,
      description: milestone.description ?? "",
      dueDate: milestone.dueDate.slice(0, 10),
      status: milestone.status,
    });
    setError(null);
    setModalOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    saveMutation.mutate();
  }

  const milestones = data?.milestones ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Milestones</h2>
          <p className="text-xs text-slate-400">Key delivery checkpoints for {project.name}.</p>
        </div>
        {canManage ? (
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New milestone
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="skeleton h-40 w-full" />
      ) : milestones.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-5 w-5" />}
          title="No milestones"
          description="Add milestones to mark external commitments and release targets."
          action={canManage ? <Button size="sm" onClick={openCreate}>Add milestone</Button> : null}
        />
      ) : (
        <div className="surface divide-y divide-slate-100 dark:divide-slate-800">
          {milestones.map((milestone) => (
            <div key={milestone.id} className="flex items-start gap-3 px-4 py-3.5">
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  milestone.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10"
                    : milestone.status === "AT_RISK"
                      ? "bg-amber-50 text-amber-500 dark:bg-amber-500/10"
                      : "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10",
                )}
              >
                {milestone.status === "COMPLETED" ? <CheckCircle2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-sm font-semibold text-slate-800 dark:text-slate-100", milestone.status === "COMPLETED" && "line-through opacity-60")}>
                    {milestone.name}
                  </p>
                  <StatusBadge status={milestone.status} />
                  {milestone.status !== "COMPLETED" && isOverdue(milestone.dueDate) ? <Badge tone="red">Overdue</Badge> : null}
                </div>
                {milestone.description ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{milestone.description}</p>
                ) : null}
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                  <CalendarClock className="h-3 w-3" /> {formatDate(milestone.dueDate, "MMM d, yyyy")}
                  {milestone.completedAt ? ` · completed ${formatDate(milestone.completedAt)}` : ""}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(milestone)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"
                    title={milestone.status === "COMPLETED" ? "Reopen" : "Mark complete"}
                  >
                    {milestone.status === "COMPLETED" ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(milestone)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    title="Edit milestone"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this milestone?")) deleteMutation.mutate(milestone.id);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    title="Delete milestone"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit milestone" : "New milestone"}
        description="Milestones are visible across project insights and the calendar."
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {editing ? "Save changes" : "Create milestone"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" required>
            <Input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Public beta" autoFocus />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} placeholder="What does successful delivery look like?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" required>
              <Input type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MilestoneStatus })}>
                <option value="PENDING">Pending</option>
                <option value="AT_RISK">At risk</option>
                <option value="COMPLETED">Completed</option>
              </Select>
            </Field>
          </div>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>
    </div>
  );
}
