import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  CalendarClock,
  Download,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, downloadFile } from "../lib/api";
import type { Capability } from "../lib/permissions";
import type { Comment, Priority, Project, Task, TaskCategory } from "../lib/types";
import { bytes, cn, formatDate, formatDateTime, isOverdue, relativeTime, toDateInput } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Input,
  Select,
  Tabs,
  Textarea,
} from "./ui";

type DrawerTab = "details" | "comments" | "files" | "activity";

export function TaskDrawer({
  taskId,
  onClose,
  project,
  categories,
  permissions,
}: {
  taskId: string | null;
  onClose: () => void;
  project: Project;
  categories: TaskCategory[];
  permissions: Set<Capability>;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<DrawerTab>("details");
  const [commentBody, setCommentBody] = useState("");
  const [dependsOnId, setDependsOnId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [columnId, setColumnId] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [sprintId, setSprintId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimateHours, setEstimateHours] = useState("");
  const [storyPoints, setStoryPoints] = useState("");

  const canWrite = permissions.has("task:write");
  const canDelete = permissions.has("task:delete");
  const canComment = permissions.has("comment:write");
  const canAttach = permissions.has("attachment:write");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () =>
      api<{ task: Task; permissions: string[] }>(`/tasks/${taskId}`),
    enabled: Boolean(taskId),
  });

  const task = data?.task;

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setColumnId(task.columnId);
    setPriority(task.priority);
    setSprintId(task.sprintId ?? "");
    setCategoryId(task.categoryId ?? "");
    setAssigneeIds(task.assignments.map((assignment) => assignment.user.id));
    setStartDate(toDateInput(task.startDate));
    setDueDate(toDateInput(task.dueDate));
    setEstimateHours(task.estimateHours !== null ? String(task.estimateHours) : "");
    setStoryPoints(task.storyPoints !== null ? String(task.storyPoints) : "");
    setTab("details");
  }, [task?.id]);

  const { data: projectTasks } = useQuery({
    queryKey: ["tasks", project.id, "all"],
    queryFn: () => api<{ tasks: Task[] }>(`/projects/${project.id}/tasks`),
    enabled: Boolean(taskId),
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["sprints", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["mywork"] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}`, {
        method: "PATCH",
        body: {
          title,
          description: description.trim() || null,
          columnId,
          priority,
          sprintId: sprintId || null,
          categoryId: categoryId || null,
          assigneeIds,
          startDate: startDate || null,
          dueDate: dueDate || null,
          estimateHours: estimateHours === "" ? null : Number(estimateHours),
          storyPoints: storyPoints === "" ? null : Number(storyPoints),
        },
      }),
    onSuccess: () => {
      invalidateAll();
      push("Task updated", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not update task", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: { body: commentBody },
      }),
    onSuccess: () => {
      setCommentBody("");
      invalidateAll();
    },
    onError: (caught) =>
      push("Comment failed", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      api(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => invalidateAll(),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) =>
      api(`/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => invalidateAll(),
  });

  const addDependency = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/dependencies`, {
        method: "POST",
        body: { dependsOnTaskId: dependsOnId },
      }),
    onSuccess: () => {
      setDependsOnId("");
      invalidateAll();
      push("Dependency added", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not add dependency", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const removeDependency = useMutation({
    mutationFn: (dependsOnTaskId: string) =>
      api(`/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { method: "DELETE" }),
    onSuccess: () => invalidateAll(),
  });

  const deleteTask = useMutation({
    mutationFn: () => api(`/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => {
      push("Task deleted", { tone: "success" });
      onClose();
      void queryClient.invalidateQueries({ queryKey: ["tasks", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (caught) =>
      push("Could not delete task", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api(`/tasks/${taskId}/attachments`, { method: "POST", body: formData });
      invalidateAll();
      push("File uploaded", { tone: "success" });
    } catch (caught) {
      push("Upload failed", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  if (!taskId) return null;

  const members = project.members ?? [];
  const sprints = project.sprints ?? [];
  const columns = project.columns ?? [];
  const dependencyOptions = (projectTasks?.tasks ?? []).filter(
    (candidate) =>
      candidate.id !== taskId &&
      candidate.columnId !== undefined &&
      !(task?.dependencies ?? []).some((dependency) => dependency.dependsOn.id === candidate.id),
  );

  return (
    <Drawer
      open={Boolean(taskId)}
      onClose={onClose}
      width="max-w-2xl"
      title={
        task ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {project.key}-{task.number}
            </span>
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{task.title}</span>
          </div>
        ) : (
          <span className="skeleton block h-5 w-48" />
        )
      }
      headerExtra={
        task && canDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (window.confirm("Delete this task? This cannot be undone.")) deleteTask.mutate();
            }}
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        ) : null
      }
    >
      {isLoading || !task ? (
        <div className="space-y-3 p-5">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : isError ? (
        <div className="p-5">
          <EmptyState title="Task not found" description="It may have been deleted by someone else." />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                task.column.isDone
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {task.column.name}
            </span>
            <Badge tone={task.priority === "URGENT" ? "red" : task.priority === "HIGH" ? "amber" : "sky"}>
              {task.priority.toLowerCase()}
            </Badge>
            {task.dueDate ? (
              <span className={cn("flex items-center gap-1 text-[11px]", isOverdue(task.dueDate) && !task.column.isDone ? "text-red-500" : "text-slate-400")}>
                <CalendarClock className="h-3 w-3" /> {formatDate(task.dueDate)}
              </span>
            ) : null}
            <span className="text-[11px] text-slate-400">Created {formatDate(task.createdAt, "MMM d, yyyy")}</span>
          </div>

          <div className="px-5 pt-3">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "details", label: "Details" },
                { value: "comments", label: "Comments", count: task.comments?.length ?? task._count?.comments ?? 0 },
                { value: "files", label: "Files", count: task.attachments?.length ?? task._count?.attachments ?? 0 },
                { value: "activity", label: "Activity" },
              ]}
            />
          </div>

          <div className="p-5">
            {tab === "details" ? (
              <div className="space-y-5">
                <div className="space-y-3">
                  <Field label="Title">
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canWrite} />
                  </Field>
                  <Field label="Description">
                    <Textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={!canWrite}
                      rows={5}
                      placeholder="Add context, acceptance criteria, and links…"
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Column">
                    <Select value={columnId} onChange={(event) => setColumnId(event.target.value)} disabled={!canWrite}>
                      {columns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} disabled={!canWrite}>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </Select>
                  </Field>
                  <Field label="Sprint">
                    <Select value={sprintId} onChange={(event) => setSprintId(event.target.value)} disabled={!canWrite}>
                      <option value="">Backlog</option>
                      {sprints.map((sprint) => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.name} · {sprint.status.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Category">
                    <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={!canWrite}>
                      <option value="">No category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Start date">
                    <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={!canWrite} />
                  </Field>
                  <Field label="Due date">
                    <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!canWrite} />
                  </Field>
                  <Field label="Estimate (hours)">
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={estimateHours}
                      onChange={(event) => setEstimateHours(event.target.value)}
                      disabled={!canWrite}
                    />
                  </Field>
                  <Field label="Story points">
                    <Input
                      type="number"
                      min={0}
                      value={storyPoints}
                      onChange={(event) => setStoryPoints(event.target.value)}
                      disabled={!canWrite}
                    />
                  </Field>
                </div>

                <Field label="Assignees">
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((member) => {
                      const selected = assigneeIds.includes(member.userId);
                      return (
                        <button
                          key={member.userId}
                          type="button"
                          disabled={!canWrite}
                          onClick={() =>
                            setAssigneeIds((current) =>
                              current.includes(member.userId)
                                ? current.filter((id) => id !== member.userId)
                                : [...current, member.userId],
                            )
                          }
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition disabled:opacity-70",
                            selected
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300"
                              : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400",
                          )}
                        >
                          <Avatar name={member.user.name} color={member.user.avatarColor} size="xs" />
                          {member.user.name}
                          {selected ? <X className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
                        </button>
                      );
                    })}
                    {members.length === 0 ? <p className="text-xs text-slate-400">No project members yet.</p> : null}
                  </div>
                </Field>

                {canWrite ? (
                  <div className="flex justify-end">
                    <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                      Save changes
                    </Button>
                  </div>
                ) : null}

                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Link2 className="h-3.5 w-3.5" /> Dependencies
                  </h3>
                  <div className="mt-2 space-y-1.5">
                    {(task.dependencies ?? []).length === 0 ? (
                      <p className="text-[11px] text-slate-400">No blockers.</p>
                    ) : (
                      task.dependencies!.map((dependency) => (
                        <div
                          key={dependency.dependsOn.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50"
                        >
                          <span className="truncate text-slate-600 dark:text-slate-300">
                            <span className="mr-1.5 text-[10px] font-semibold text-slate-400">
                              {project.key}-{dependency.dependsOn.number}
                            </span>
                            {dependency.dependsOn.title}
                            <span className="ml-1.5 text-[10px] text-slate-400">{dependency.dependsOn.column.name}</span>
                          </span>
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => removeDependency.mutate(dependency.dependsOn.id)}
                              className="rounded p-1 text-slate-400 hover:text-red-500"
                              aria-label="Remove dependency"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                  {canWrite ? (
                    <div className="mt-2 flex gap-2">
                      <Select value={dependsOnId} onChange={(event) => setDependsOnId(event.target.value)} className="flex-1">
                        <option value="">Add a blocking task…</option>
                        {dependencyOptions.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {project.key}-{candidate.number} {candidate.title}
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!dependsOnId}
                        loading={addDependency.isPending}
                        onClick={() => addDependency.mutate()}
                      >
                        Add
                      </Button>
                    </div>
                  ) : null}
                  {(task.dependents ?? []).length > 0 ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Blocks</p>
                      {task.dependents!.map((dependent) => (
                        <p key={dependent.task.id} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="mr-1.5 text-[10px] font-semibold text-slate-400">
                            {project.key}-{dependent.task.number}
                          </span>
                          {dependent.task.title}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                  Created by {task.createdBy?.name ?? "Unknown"} · Updated {relativeTime(task.updatedAt)}
                </div>
              </div>
            ) : null}

            {tab === "comments" ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  {(task.comments ?? []).length === 0 ? (
                    <EmptyState
                      icon={<MessageSquare className="h-5 w-5" />}
                      title="No comments yet"
                      description="Share context, decisions, or a quick status update."
                      className="py-8"
                    />
                  ) : (
                    (task.comments ?? []).map((comment: Comment) => (
                      <div key={comment.id} className="flex items-start gap-2.5">
                        <Avatar name={comment.author.name} color={comment.author.avatarColor} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{comment.author.name}</span>
                            <span className="text-[10px] text-slate-400">{relativeTime(comment.createdAt)}</span>
                            {comment.author.id === user?.id ? (
                              <button
                                type="button"
                                onClick={() => deleteComment.mutate(comment.id)}
                                className="ml-auto rounded p-1 text-slate-300 transition hover:text-red-500"
                                aria-label="Delete comment"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                            {comment.body}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {canComment ? (
                  <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                    <Textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder="Write a comment…"
                      rows={3}
                      className="border-0 bg-transparent px-1 py-1 focus:ring-0 dark:bg-transparent"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        icon={<Send className="h-3.5 w-3.5" />}
                        disabled={!commentBody.trim()}
                        loading={commentMutation.isPending}
                        onClick={() => commentMutation.mutate()}
                      >
                        Comment
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Your role can view but not comment.</p>
                )}
              </div>
            ) : null}

            {tab === "files" ? (
              <div className="space-y-3">
                {canAttach ? (
                  <>
                    <input
                      ref={fileInput}
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadFile(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-7 text-xs text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500 disabled:opacity-60 dark:border-slate-700"
                    >
                      <Upload className="h-5 w-5" />
                      {uploading ? "Uploading…" : "Upload an image, PDF, text, CSV, ZIP, or Office document (max 10MB)"}
                    </button>
                  </>
                ) : null}

                {(task.attachments ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Paperclip className="h-5 w-5" />}
                    title="No files attached"
                    description="Attach specifications, screenshots, or reference documents."
                    className="py-8"
                  />
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {(task.attachments ?? []).map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                            {attachment.filename}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {bytes(attachment.size)} · {attachment.uploader.name} · {formatDate(attachment.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void downloadFile(`/attachments/${attachment.id}/download`, attachment.filename)}
                          className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          aria-label="Download attachment"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {canAttach || attachment.uploader.id === user?.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Delete this attachment?")) {
                                deleteAttachment.mutate(attachment.id);
                              }
                            }}
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                            aria-label="Delete attachment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "activity" ? (
              <div className="space-y-4">
                {(task.activities ?? []).length === 0 ? (
                  <EmptyState
                    icon={<ActivityIcon className="h-5 w-5" />}
                    title="No activity recorded"
                    description="Task changes, comments and attachments will appear here."
                    className="py-8"
                  />
                ) : (
                  (task.activities ?? []).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-2.5">
                      {activity.actor ? (
                        <Avatar name={activity.actor.name} color={activity.actor.avatarColor} size="xs" />
                      ) : (
                        <span className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-700" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{activity.actor?.name ?? "System"}</span>{" "}
                          {activity.action.replace(".", " ")}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatDateTime(activity.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </Drawer>
  );
}
