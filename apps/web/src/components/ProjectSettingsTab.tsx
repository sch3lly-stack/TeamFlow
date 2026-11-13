import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Settings2, Trash2, UserPlus, Workflow } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Capability } from "../lib/permissions";
import type {
  Priority,
  Project,
  ProjectRole,
  ProjectStatus,
  Team,
  WorkflowColumn,
} from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "./ui";

export function ProjectSettingsTab({
  project,
  permissions,
  onArchived,
}: {
  project: Project;
  permissions: Set<Capability>;
  onArchived: () => void;
}) {
  const { orgId } = useWorkspace();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const canManage = permissions.has("project:manage");
  const canWorkflow = permissions.has("workflow:manage");

  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [description, setDescription] = useState(project.description ?? "");
  const [objectives, setObjectives] = useState(project.objectives ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [priority, setPriority] = useState<Priority>(project.priority);
  const [startDate, setStartDate] = useState(project.startDate?.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = useState(project.dueDate?.slice(0, 10) ?? "");
  const [ownerId, setOwnerId] = useState(project.ownerId);
  const [teamId, setTeamId] = useState(project.teamId ?? "");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [columnModal, setColumnModal] = useState<{ open: boolean; column: WorkflowColumn | null }>({
    open: false,
    column: null,
  });
  const [columnName, setColumnName] = useState("");
  const [columnIsDone, setColumnIsDone] = useState(false);
  const [columnWip, setColumnWip] = useState("");
  const [columnPosition, setColumnPosition] = useState("0");
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("CONTRIBUTOR");

  useEffect(() => {
    setName(project.name);
    setKey(project.key);
    setDescription(project.description ?? "");
    setObjectives(project.objectives ?? "");
    setStatus(project.status);
    setPriority(project.priority);
    setStartDate(project.startDate?.slice(0, 10) ?? "");
    setDueDate(project.dueDate?.slice(0, 10) ?? "");
    setOwnerId(project.ownerId);
    setTeamId(project.teamId ?? "");
  }, [project.id]);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api<{ teams: Team[] }>(`/organizations/${orgId}/teams`),
  });
  const { data: memberData } = useQuery({
    queryKey: ["member-options", orgId],
    queryFn: () =>
      api<{ members: { user: { id: string; name: string; email: string; avatarColor: string }; role: string }[] }>(
        `/organizations/${orgId}/member-options`,
      ),
  });

  function refreshProject() {
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["projects", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveProject = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}`, {
        method: "PATCH",
        body: {
          name,
          key,
          description: description.trim() || null,
          objectives: objectives.trim() || null,
          status,
          priority,
          startDate: startDate || null,
          dueDate: dueDate || null,
          ownerId,
          teamId: teamId || null,
        },
      }),
    onSuccess: () => {
      refreshProject();
      push("Project updated", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not update project", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const archiveProject = useMutation({
    mutationFn: () => api(`/projects/${project.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      push("Project archived", { tone: "success" });
      onArchived();
    },
    onError: (caught) =>
      push("Could not archive project", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const saveColumn = useMutation({
    mutationFn: () => {
      const body = {
        name: columnName,
        isDone: columnIsDone,
        wipLimit: columnWip === "" ? null : Number(columnWip),
        position: Number(columnPosition),
      };
      return columnModal.column
        ? api(`/projects/${project.id}/columns/${columnModal.column.id}`, { method: "PATCH", body })
        : api(`/projects/${project.id}/columns`, { method: "POST", body });
    },
    onSuccess: () => {
      refreshProject();
      setColumnModal({ open: false, column: null });
      push("Workflow updated", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not save column", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const deleteColumn = useMutation({
    mutationFn: (columnId: string) =>
      api(`/projects/${project.id}/columns/${columnId}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshProject();
      push("Column deleted", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not delete column", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const addMember = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/members`, {
        method: "POST",
        body: { userId: addUserId, role: addRole },
      }),
    onSuccess: () => {
      setAddUserId("");
      refreshProject();
      push("Member added", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not add member", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const updateMemberRole = useMutation({
    mutationFn: (input: { userId: string; role: ProjectRole }) =>
      api(`/projects/${project.id}/members/${input.userId}`, {
        method: "PATCH",
        body: { role: input.role },
      }),
    onSuccess: () => refreshProject(),
    onError: (caught) =>
      push("Could not change role", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/projects/${project.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => refreshProject(),
    onError: (caught) =>
      push("Could not remove member", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  function openColumnModal(column?: WorkflowColumn) {
    setColumnModal({ open: true, column: column ?? null });
    setColumnName(column?.name ?? "");
    setColumnIsDone(column?.isDone ?? false);
    setColumnWip(column?.wipLimit ? String(column.wipLimit) : "");
    setColumnPosition(String(column?.position ?? (project.columns?.length ?? 0)));
  }

  const columns = [...(project.columns ?? [])].sort((a, b) => a.position - b.position);
  const existingUserIds = new Set((project.members ?? []).map((member) => member.userId));
  const availableMembers = (memberData?.members ?? []).filter((member) => !existingUserIds.has(member.user.id));

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Project settings</h2>
          {!canManage ? <Badge tone="neutral">Read only</Badge> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Key">
            <Input value={key} onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} disabled={!canManage} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} disabled={!canManage}>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="COMPLETED">Completed</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} disabled={!canManage}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </Field>
          <Field label="Owner">
            <Select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={!canManage}>
              {(memberData?.members ?? []).map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Team">
            <Select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={!canManage}>
              <option value="">No team</option>
              {(teamsData?.teams ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Deadline">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} disabled={!canManage} />
          </Field>
          <Field label="Objectives" className="sm:col-span-2">
            <Textarea value={objectives} onChange={(event) => setObjectives(event.target.value)} rows={2} disabled={!canManage} />
          </Field>
        </div>
        {canManage ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" loading={saveProject.isPending} onClick={() => saveProject.mutate()}>
              Save project
            </Button>
          </div>
        ) : null}
      </div>

      <div className="surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Workflow</h2>
            <Badge tone="neutral">{columns.length} columns</Badge>
          </div>
          {canWorkflow ? (
            <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openColumnModal()}>
              Add column
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          {columns.map((column) => (
            <div key={column.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className={cn("h-2 w-2 rounded-full", column.isDone ? "bg-emerald-500" : "bg-slate-400")} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{column.name}</span>
              <span className="text-[10px] text-slate-400">position {column.position}</span>
              {column.isDone ? <Badge tone="green">Done</Badge> : null}
              {column.wipLimit ? <Badge tone="amber">WIP {column.wipLimit}</Badge> : null}
              <span className="text-[10px] text-slate-400">{column.taskCount ?? 0} tasks</span>
              {canWorkflow ? (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openColumnModal(column)}
                    className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete ${column.name}?`)) deleteColumn.mutate(column.id);
                    }}
                    className="rounded p-1 text-slate-300 hover:text-red-500"
                    aria-label="Delete column"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          Columns with tasks cannot be deleted. A project must keep at least one done column.
        </p>
      </div>

      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Project members</h2>
          <Badge tone="neutral">{project.members?.length ?? 0}</Badge>
        </div>
        <div className="space-y-1.5">
          {(project.members ?? []).map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <Avatar name={member.user.name} color={member.user.avatarColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{member.user.name}</p>
                <p className="truncate text-[10px] text-slate-400">{member.user.email}</p>
              </div>
              {member.userId === project.ownerId ? <Badge tone="indigo">Owner</Badge> : null}
              {canManage ? (
                <>
                  <Select
                    value={member.role}
                    onChange={(event) =>
                      updateMemberRole.mutate({ userId: member.userId, role: event.target.value as ProjectRole })
                    }
                    className="h-7 w-32 text-[11px]"
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="CONTRIBUTOR">Contributor</option>
                    <option value="VIEWER">Viewer</option>
                  </Select>
                  {member.userId !== project.ownerId ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${member.user.name} from this project?`)) {
                          removeMember.mutate(member.userId);
                        }
                      }}
                      className="rounded p-1 text-slate-300 hover:text-red-500"
                      aria-label="Remove project member"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </>
              ) : (
                <Badge tone="neutral">{member.role.toLowerCase()}</Badge>
              )}
            </div>
          ))}
        </div>
        {canManage && availableMembers.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Select value={addUserId} onChange={(event) => setAddUserId(event.target.value)} className="flex-1">
              <option value="">Add an organization member…</option>
              {availableMembers.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name} · {member.user.email}
                </option>
              ))}
            </Select>
            <Select value={addRole} onChange={(event) => setAddRole(event.target.value as ProjectRole)} className="sm:w-36">
              <option value="CONTRIBUTOR">Contributor</option>
              <option value="MANAGER">Manager</option>
              <option value="VIEWER">Viewer</option>
            </Select>
            <Button size="sm" disabled={!addUserId} loading={addMember.isPending} onClick={() => addMember.mutate()}>
              Add member
            </Button>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-500/20 dark:bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">Archive project</h2>
              <p className="mt-0.5 text-xs leading-5 text-red-700/80 dark:text-red-300/70">
                Archiving removes the project from active views while preserving its history.
                This cannot be undone from the interface.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={columnModal.open}
        onClose={() => setColumnModal({ open: false, column: null })}
        title={columnModal.column ? "Edit workflow column" : "Add workflow column"}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setColumnModal({ open: false, column: null })}>
              Cancel
            </Button>
            <Button size="sm" loading={saveColumn.isPending} onClick={() => saveColumn.mutate()}>
              Save column
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Column name" required>
            <Input value={columnName} onChange={(event) => setColumnName(event.target.value)} placeholder="Ready for QA" autoFocus />
          </Field>
          <Field label="Position">
            <Input type="number" min={0} value={columnPosition} onChange={(event) => setColumnPosition(event.target.value)} />
          </Field>
          <Field label="WIP limit" hint="Optional. Warn when more tasks than this are in the column.">
            <Input type="number" min={1} value={columnWip} onChange={(event) => setColumnWip(event.target.value)} placeholder="No limit" />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={columnIsDone}
              onChange={(event) => setColumnIsDone(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            Tasks in this column count as completed
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archiveProject.mutate()}
        title="Archive this project?"
        description="The project will disappear from active project lists. Reports remain available to admins."
        confirmLabel="Archive project"
        loading={archiveProject.isPending}
      />
    </div>
  );
}
