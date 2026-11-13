import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { OrgMember, Priority, Project, ProjectStatus, Team } from "../lib/types";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { useToast } from "../providers/ToastProvider";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { cn } from "../lib/utils";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#0ea5e9", "#14b8a6", "#ef4444"];

function deriveKey(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 4).map((word) => word[0]).join("");
  return words[0]!.slice(0, 6);
}

export function ProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: Project) => void;
}) {
  const { orgId } = useWorkspace();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [status, setStatus] = useState<ProjectStatus>("PLANNING");
  const [teamId, setTeamId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [error, setError] = useState<string | null>(null);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api<{ teams: Team[] }>(`/organizations/${orgId}/teams`),
    enabled: open && Boolean(orgId),
  });
  const { data: memberData } = useQuery({
    queryKey: ["member-options", orgId],
    queryFn: () =>
      api<{ members: { user: { id: string; name: string }; role: string }[] }>(
        `/organizations/${orgId}/member-options`,
      ),
    enabled: open && Boolean(orgId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ project: Project }>(`/organizations/${orgId}/projects`, {
        method: "POST",
        body: {
          name,
          key,
          description: description.trim() || undefined,
          objectives: objectives.trim() || undefined,
          priority,
          status,
          color,
          teamId: teamId || null,
          ownerId: ownerId || undefined,
          startDate: startDate || null,
          dueDate: dueDate || null,
        },
      }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      push("Project created", { message: response.project.name, tone: "success" });
      reset();
      onCreated?.(response.project);
      onClose();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not create project"),
  });

  function reset() {
    setName("");
    setKey("");
    setKeyTouched(false);
    setDescription("");
    setObjectives("");
    setPriority("MEDIUM");
    setStatus("PLANNING");
    setTeamId("");
    setOwnerId("");
    setStartDate("");
    setDueDate("");
    setColor(COLORS[0]!);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create project"
      description="Set up scope, ownership and a delivery target."
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Create project
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1.6fr_0.8fr]">
          <Field label="Project name" required>
            <Input
              required
              minLength={2}
              value={name}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!keyTouched) setKey(deriveKey(next));
              }}
              placeholder="Atlas API Platform"
            />
          </Field>
          <Field label="Key" required hint="Used for task IDs, e.g. ATLAS-42.">
            <Input
              required
              minLength={2}
              maxLength={8}
              value={key}
              onChange={(event) => {
                setKeyTouched(true);
                setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
              }}
              placeholder="ATLAS"
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this project delivering?"
            rows={2}
          />
        </Field>

        <Field label="Objectives" hint="Optional. Outcomes and success criteria.">
          <Textarea
            value={objectives}
            onChange={(event) => setObjectives(event.target.value)}
            placeholder="Ship public beta, reduce p95 latency below 180ms…"
            rows={2}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="COMPLETED">Completed</option>
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
          <Field label="Owner">
            <Select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Me (default)</option>
              {memberData?.members.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Team">
            <Select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">No team</option>
              {teamsData?.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="Deadline">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>

        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                className={cn(
                  "h-7 w-7 rounded-lg transition",
                  color === option ? "ring-2 ring-slate-400 ring-offset-2 dark:ring-offset-ink-900" : "",
                )}
                style={{ backgroundColor: option }}
                aria-label={`Use color ${option}`}
              />
            ))}
          </div>
        </Field>

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
