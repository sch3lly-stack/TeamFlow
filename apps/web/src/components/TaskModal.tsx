import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Priority, Project, Task, TaskCategory } from "../lib/types";
import { cn } from "../lib/utils";
import { useToast } from "../providers/ToastProvider";
import { Avatar, Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function TaskModal({
  open,
  onClose,
  project,
  categories,
  defaultColumnId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  categories: TaskCategory[];
  defaultColumnId?: string;
  onCreated?: (task: Task) => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const columns = project.columns ?? [];
  const sprints = (project.sprints ?? []).filter((sprint) => sprint.status !== "COMPLETED");
  const members = project.members ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [columnId, setColumnId] = useState(defaultColumnId ?? columns[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimateHours, setEstimateHours] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setColumnId(defaultColumnId ?? columns[0]?.id ?? "");
      setError(null);
    }
  }, [open, defaultColumnId, columns]);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ task: Task }>(`/projects/${project.id}/tasks`, {
        method: "POST",
        body: {
          title,
          description: description.trim() || undefined,
          columnId: columnId || undefined,
          priority,
          assigneeIds,
          sprintId: sprintId || null,
          categoryId: categoryId || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
          estimateHours: estimateHours === "" ? null : Number(estimateHours),
          storyPoints: storyPoints === "" ? null : Number(storyPoints),
        },
      }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["sprints", project.id] });
      push("Task created", {
        message: `${project.key}-${response.task.number} ${response.task.title}`,
        tone: "success",
      });
      reset();
      onClose();
      onCreated?.(response.task);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not create task"),
  });

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setAssigneeIds([]);
    setSprintId("");
    setCategoryId("");
    setStartDate("");
    setDueDate("");
    setEstimateHours("");
    setStoryPoints("");
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create task"
      description={`Add work to ${project.name}.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Create task
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required>
          <Input
            required
            minLength={2}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Harden refresh token rotation"
            autoFocus
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Context, acceptance criteria, links…"
            rows={3}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Column">
            <Select value={columnId} onChange={(event) => setColumnId(event.target.value)}>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </Field>
          <Field label="Sprint">
            <Select value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
              <option value="">Backlog</option>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name} · {sprint.status.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field label="Estimate (hours)">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={estimateHours}
              onChange={(event) => setEstimateHours(event.target.value)}
              placeholder="8"
            />
          </Field>
          <Field label="Story points">
            <Input
              type="number"
              min={0}
              value={storyPoints}
              onChange={(event) => setStoryPoints(event.target.value)}
              placeholder="3"
            />
          </Field>
        </div>

        {members.length > 0 ? (
          <Field label="Assignees">
            <div className="flex flex-wrap gap-1.5">
              {members.map((member) => {
                const selected = assigneeIds.includes(member.userId);
                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => toggleAssignee(member.userId)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition",
                      selected
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                    )}
                  >
                    <Avatar name={member.user.name} color={member.user.avatarColor} size="xs" />
                    {member.user.name}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}
