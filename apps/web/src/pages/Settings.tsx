import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ClipboardCopy,
  KeyRound,
  Mail,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Select,
  Tabs,
  Textarea,
} from "../components/ui";
import { api } from "../lib/api";
import { ROLE_LABELS } from "../lib/permissions";
import type {
  AuditLog,
  Department,
  Invitation,
  OrgMember,
  Organization,
  OrgRole,
  Team,
  UserSummary,
} from "../lib/types";
import { cn, formatDate, formatDateTime, humanize, relativeTime } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";

type SettingsTab = "organization" | "members" | "invitations" | "structure" | "audit" | "profile";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#0ea5e9", "#14b8a6", "#ef4444"];
const INVITE_ROLES: OrgRole[] = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "DEVELOPER", "VIEWER"];

function assignableRoles(role: OrgRole | undefined): OrgRole[] {
  if (role === "OWNER") return ["OWNER", "ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "DEVELOPER", "VIEWER"];
  if (role === "ADMIN") return ["ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "DEVELOPER", "VIEWER"];
  return [];
}

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const { orgId, can, membership, role } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = (searchParams.get("tab") as SettingsTab) || "organization";
  const { push } = useToast();
  const queryClient = useQueryClient();

  const allowedTabs: { value: SettingsTab; label: string }[] = [
    { value: "organization", label: "Organization" },
    ...(can("members:manage")
      ? [
          { value: "members" as const, label: "Members" },
          { value: "invitations" as const, label: "Invitations" },
        ]
      : []),
    ...(can("team:manage") || can("structure:manage")
      ? [{ value: "structure" as const, label: "Departments & teams" }]
      : []),
    ...(can("audit:read") ? [{ value: "audit" as const, label: "Audit log" }] : []),
    { value: "profile", label: "My profile" },
  ];
  const tab = allowedTabs.some((item) => item.value === requestedTab) ? requestedTab : "organization";

  const { data: orgData, isLoading } = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => api<{ organization: Organization }>(`/organizations/${orgId}`),
    enabled: Boolean(orgId),
  });

  const { data: memberData } = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ members: OrgMember[] }>(`/organizations/${orgId}/members`),
    enabled: Boolean(orgId),
  });

  const { data: departmentData } = useQuery({
    queryKey: ["departments", orgId],
    queryFn: () => api<{ departments: Department[] }>(`/organizations/${orgId}/departments`),
    enabled: Boolean(orgId),
  });

  const { data: teamData } = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api<{ teams: Team[] }>(`/organizations/${orgId}/teams`),
    enabled: Boolean(orgId),
  });

  if (isLoading || !orgData || !memberData || !user) return <PageLoader label="Loading settings" />;

  const organization = orgData.organization;
  const members = memberData.members;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description={`Manage ${organization.name}, its people, structure and security.`}
        eyebrow={membership?.organization.name}
      />
      <Tabs tabs={allowedTabs} value={tab} onChange={(value) => setSearchParams({ tab: value }, { replace: true })} />

      {tab === "organization" ? (
        <OrganizationTab
          organization={organization}
          canManage={can("org:manage")}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            void refresh();
          }}
        />
      ) : null}

      {tab === "members" ? (
        <MembersTab
          members={members.filter((member) => member.id)}
          actorRole={role}
          departments={departmentData?.departments ?? []}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["members", orgId] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            void queryClient.invalidateQueries({ queryKey: ["workload", orgId] });
          }}
        />
      ) : null}

      {tab === "invitations" ? <InvitationsTab /> : null}

      {tab === "structure" ? (
        <StructureTab
          departments={departmentData?.departments ?? []}
          teams={teamData?.teams ?? []}
          members={members}
          canManageDepartments={can("structure:manage")}
          canManageTeams={can("team:manage")}
        />
      ) : null}

      {tab === "audit" ? <AuditTab /> : null}

      {tab === "profile" ? <ProfileTab user={user} /> : null}
    </div>
  );
}

function OrganizationTab({
  organization,
  canManage,
  onSaved,
}: {
  organization: Organization;
  canManage: boolean;
  onSaved: () => void;
}) {
  const { orgId } = useWorkspace();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const settings = (organization.settings ?? {}) as {
    weekStart?: string;
    defaultPriority?: string;
    workloadThresholds?: { openTasks?: number; estimatedHours?: number };
    notifications?: { realtime?: boolean };
  };
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [description, setDescription] = useState(organization.description ?? "");
  const [logoColor, setLogoColor] = useState(organization.logoColor);
  const [weekStart, setWeekStart] = useState(settings.weekStart ?? "monday");
  const [defaultPriority, setDefaultPriority] = useState(settings.defaultPriority ?? "MEDIUM");
  const [taskThreshold, setTaskThreshold] = useState(String(settings.workloadThresholds?.openTasks ?? 8));
  const [hoursThreshold, setHoursThreshold] = useState(String(settings.workloadThresholds?.estimatedHours ?? 40));
  const [realtime, setRealtime] = useState(settings.notifications?.realtime ?? true);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#64748b");

  const { data: categoryData } = useQuery({
    queryKey: ["categories", orgId],
    queryFn: () => api<{ categories: { id: string; name: string; color: string }[] }>(`/organizations/${orgId}/categories`),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api(`/organizations/${orgId}`, {
        method: "PATCH",
        body: {
          name,
          slug,
          description: description.trim() || null,
          logoColor,
          settings: {
            weekStart,
            defaultPriority,
            workloadThresholds: {
              openTasks: Number(taskThreshold) || 8,
              estimatedHours: Number(hoursThreshold) || 40,
            },
            notifications: { realtime },
          },
        },
      }),
    onSuccess: () => {
      push("Organization updated", { tone: "success" });
      onSaved();
    },
    onError: (caught) =>
      push("Could not save organization", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const addCategory = useMutation({
    mutationFn: () =>
      api(`/organizations/${orgId}/categories`, {
        method: "POST",
        body: { name: categoryName, color: categoryColor },
      }),
    onSuccess: () => {
      setCategoryName("");
      void queryClient.invalidateQueries({ queryKey: ["categories", orgId] });
      push("Category added", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not add category", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api(`/organizations/${orgId}/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["categories", orgId] }),
    onError: (caught) =>
      push("Could not delete category", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Organization profile</h2>
          {!canManage ? <Badge tone="neutral">Read only</Badge> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="URL slug" hint="Lowercase letters, numbers and dashes.">
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} disabled={!canManage} />
          </Field>
          <Field label="Brand color">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={!canManage}
                  onClick={() => setLogoColor(color)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition",
                    logoColor === color ? "ring-2 ring-slate-400 ring-offset-2 dark:ring-offset-ink-900" : "",
                  )}
                  style={{ backgroundColor: color }}
                >
                  {logoColor === color ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Week starts">
              <Select value={weekStart} onChange={(event) => setWeekStart(event.target.value)} disabled={!canManage}>
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </Select>
            </Field>
            <Field label="Default priority">
              <Select value={defaultPriority} onChange={(event) => setDefaultPriority(event.target.value)} disabled={!canManage}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Planning thresholds</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label="Open task threshold">
              <Input type="number" min={1} value={taskThreshold} onChange={(event) => setTaskThreshold(event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Estimated hours threshold">
              <Input type="number" min={1} value={hoursThreshold} onChange={(event) => setHoursThreshold(event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Realtime updates">
              <label className="flex h-9 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={realtime} onChange={(event) => setRealtime(event.target.checked)} disabled={!canManage} className="h-4 w-4 rounded text-indigo-600" />
                Enabled
              </label>
            </Field>
          </div>
        </div>

        {canManage ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save settings
            </Button>
          </div>
        ) : null}
      </div>

      <div className="surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Task categories</h2>
        </div>
        <p className="mb-3 text-xs text-slate-400">Organization-wide labels for classifying work.</p>
        <div className="flex flex-wrap gap-1.5">
          {(categoryData?.categories ?? []).map((category) => (
            <span
              key={category.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium dark:border-slate-700"
              style={{ color: category.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
              {canManage ? (
                <button type="button" onClick={() => deleteCategory.mutate(category.id)} className="ml-0.5 text-slate-300 hover:text-red-500">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </span>
          ))}
          {!categoryData?.categories.length ? <p className="text-xs text-slate-400">No categories yet.</p> : null}
        </div>
        {canManage ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="New category" className="min-w-[180px] flex-1">
              <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Technical debt" />
            </Field>
            <input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} className="h-9 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-ink-850" aria-label="Category color" />
            <Button size="sm" variant="outline" disabled={!categoryName.trim()} loading={addCategory.isPending} onClick={() => addCategory.mutate()}>
              Add
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MembersTab({
  members,
  actorRole,
  departments,
  onChanged,
}: {
  members: OrgMember[];
  actorRole: OrgRole | undefined;
  departments: Department[];
  onChanged: () => void;
}) {
  const { orgId } = useWorkspace();
  const { push } = useToast();
  const [search, setSearch] = useState("");

  const update = useMutation({
    mutationFn: (input: { membershipId: string; role?: OrgRole; departmentId?: string | null }) =>
      api(`/organizations/${orgId}/members/${input.membershipId}`, {
        method: "PATCH",
        body: { role: input.role, departmentId: input.departmentId },
      }),
    onSuccess: () => {
      onChanged();
      push("Member updated", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not update member", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const remove = useMutation({
    mutationFn: (membershipId: string) =>
      api(`/organizations/${orgId}/members/${membershipId}`, { method: "DELETE" }),
    onSuccess: () => {
      onChanged();
      push("Member removed", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not remove member", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const filtered = members.filter((member) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return member.user.name.toLowerCase().includes(term) || member.user.email.toLowerCase().includes(term);
  });

  const options = assignableRoles(actorRole);

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Members</h2>
          <p className="text-xs text-slate-400">{members.length} people in this organization.</p>
        </div>
        <div className="sm:ml-auto sm:w-64">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people…" />
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {filtered.map((member) => {
          const targetIsOwner = member.role === "OWNER";
          const canEdit = !targetIsOwner || actorRole === "OWNER";
          return (
            <div key={member.id} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_180px_180px_120px_40px] lg:items-center">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={member.user.name} color={member.user.avatarColor} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {member.user.name} {member.isSelf ? <span className="font-normal text-slate-400">(you)</span> : null}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">{member.user.email}</p>
                </div>
              </div>
              <Select
                value={member.role}
                disabled={!canEdit || options.length === 0}
                onChange={(event) => update.mutate({ membershipId: member.id, role: event.target.value as OrgRole })}
                className="h-8 text-[11px]"
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </Select>
              <Select
                value={member.department?.id ?? ""}
                disabled={!canEdit}
                onChange={(event) => update.mutate({ membershipId: member.id, departmentId: event.target.value || null })}
                className="h-8 text-[11px]"
              >
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
              <span className="text-[10px] text-slate-400">Joined {formatDate(member.createdAt)}</span>
              <div className="flex justify-end">
                {!member.isSelf && member.role !== "OWNER" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove ${member.user.name} from the organization?`)) {
                        remove.mutate(member.id);
                      }
                    }}
                    className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    title="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 ? <p className="p-8 text-center text-xs text-slate-400">No members match that search.</p> : null}
    </div>
  );
}

function InvitationsTab() {
  const { orgId } = useWorkspace();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("DEVELOPER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: () => api<{ invitations: Invitation[] }>(`/organizations/${orgId}/invitations`),
    enabled: Boolean(orgId),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ invitation: Invitation; inviteUrl: string }>(`/organizations/${orgId}/invitations`, {
        method: "POST",
        body: { email, role },
      }),
    onSuccess: (response) => {
      setInviteUrl(response.inviteUrl);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["invitations", orgId] });
      push("Invitation created", { message: "Copy the secure link and share it directly.", tone: "success" });
    },
    onError: (caught) =>
      push("Could not create invitation", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/organizations/${orgId}/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations", orgId] });
      push("Invitation revoked", { tone: "success" });
    },
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      push("Link copied", { tone: "success" });
    } catch {
      push("Could not copy automatically", { message: text, tone: "info" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Invite a teammate</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Email" className="flex-1">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" />
          </Field>
          <Field label="Role" className="sm:w-52">
            <Select value={role} onChange={(event) => setRole(event.target.value as OrgRole)}>
              {INVITE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled={!email.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Create invite
          </Button>
        </div>
        {inviteUrl ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
            <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">Invitation link ready</p>
            <div className="mt-1.5 flex gap-2">
              <Input readOnly value={inviteUrl} className="text-[11px]" onFocus={(event) => event.target.select()} />
              <Button size="sm" variant="outline" icon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={() => void copy(inviteUrl)}>
                Copy
              </Button>
            </div>
          </div>
        ) : null}
        <p className="mt-3 text-[10px] leading-4 text-slate-400">
          TeamFlow does not send email in this demo. Deliver the secure link through your email provider or SSO onboarding flow.
        </p>
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Invitations</h2>
          <p className="text-xs text-slate-400">Pending, accepted and revoked invitations.</p>
        </div>
        {(data?.invitations.length ?? 0) === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400">No invitations yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {data!.invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{invitation.email}</p>
                  <p className="text-[10px] text-slate-400">
                    {ROLE_LABELS[invitation.role]} · expires {formatDate(invitation.expiresAt)} ·{" "}
                    {invitation.invitedBy ? `invited by ${invitation.invitedBy.name}` : "system"}
                  </p>
                </div>
                <Badge tone={invitation.status === "PENDING" ? "sky" : invitation.status === "ACCEPTED" ? "green" : "neutral"}>
                  {humanize(invitation.status)}
                </Badge>
                {invitation.status === "PENDING" ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ClipboardCopy className="h-3.5 w-3.5" />}
                      onClick={() => void copy(`${window.location.origin}/invite/${invitation.token}`)}
                    >
                      Copy link
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(invitation.id)}>
                      Revoke
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StructureTab({
  departments,
  teams,
  members,
  canManageDepartments,
  canManageTeams,
}: {
  departments: Department[];
  teams: Team[];
  members: OrgMember[];
  canManageDepartments: boolean;
  canManageTeams: boolean;
}) {
  const { orgId } = useWorkspace();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [departmentName, setDepartmentName] = useState("");
  const [departmentLead, setDepartmentLead] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDepartment, setTeamDepartment] = useState("");
  const [teamLead, setTeamLead] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["teams", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["members", orgId] });
  }

  const createDepartment = useMutation({
    mutationFn: () =>
      api(`/organizations/${orgId}/departments`, {
        method: "POST",
        body: { name: departmentName, leadId: departmentLead || null },
      }),
    onSuccess: () => {
      setDepartmentName("");
      setDepartmentLead("");
      refresh();
      push("Department created", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not create department", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const deleteDepartment = useMutation({
    mutationFn: (id: string) => api(`/organizations/${orgId}/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      push("Department deleted", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not delete department", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const createTeam = useMutation({
    mutationFn: () =>
      api(`/organizations/${orgId}/teams`, {
        method: "POST",
        body: { name: teamName, departmentId: teamDepartment || null, leadId: teamLead || null },
      }),
    onSuccess: () => {
      setTeamName("");
      setTeamDepartment("");
      setTeamLead("");
      refresh();
      push("Team created", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not create team", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const deleteTeam = useMutation({
    mutationFn: (id: string) => api(`/organizations/${orgId}/teams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      push("Team deleted", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not delete team", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Departments</h2>
          <Badge tone="neutral">{departments.length}</Badge>
        </div>
        <div className="space-y-1.5">
          {departments.map((department) => (
            <div key={department.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{department.name}</span>
              <span className="text-[10px] text-slate-400">{department._count.members} members · {department._count.teams} teams</span>
              {department.lead ? (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Avatar name={department.lead.name} color={department.lead.avatarColor} size="xs" /> {department.lead.name}
                </span>
              ) : null}
              {canManageDepartments ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete ${department.name}?`)) deleteDepartment.mutate(department.id);
                  }}
                  className="rounded p-1 text-slate-300 hover:text-red-500"
                  aria-label="Delete department"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ))}
          {departments.length === 0 ? <p className="text-xs text-slate-400">No departments yet.</p> : null}
        </div>
        {canManageDepartments ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Department name" className="flex-1">
              <Input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="Platform Engineering" />
            </Field>
            <Field label="Lead" className="sm:w-56">
              <Select value={departmentLead} onChange={(event) => setDepartmentLead(event.target.value)}>
                <option value="">No lead</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="sm" variant="outline" disabled={!departmentName.trim()} loading={createDepartment.isPending} onClick={() => createDepartment.mutate()}>
              Add department
            </Button>
          </div>
        ) : null}
      </div>

      <div className="surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Teams</h2>
            <Badge tone="neutral">{teams.length}</Badge>
          </div>
        </div>
        <div className="space-y-2">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              members={members}
              canManage={canManageTeams}
              onDelete={() => deleteTeam.mutate(team.id)}
              onChanged={refresh}
            />
          ))}
          {teams.length === 0 ? <p className="text-xs text-slate-400">No teams yet.</p> : null}
        </div>
        {canManageTeams ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Team name" className="flex-1">
              <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Core Platform" />
            </Field>
            <Field label="Department" className="sm:w-48">
              <Select value={teamDepartment} onChange={(event) => setTeamDepartment(event.target.value)}>
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lead" className="sm:w-48">
              <Select value={teamLead} onChange={(event) => setTeamLead(event.target.value)}>
                <option value="">No lead</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="sm" variant="outline" disabled={!teamName.trim()} loading={createTeam.isPending} onClick={() => createTeam.mutate()}>
              Add team
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  members,
  canManage,
  onDelete,
  onChanged,
}: {
  team: Team;
  members: OrgMember[];
  canManage: boolean;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const { orgId } = useWorkspace();
  const { push } = useToast();
  const [userId, setUserId] = useState("");

  const addMember = useMutation({
    mutationFn: () =>
      api(`/organizations/${orgId}/teams/${team.id}/members`, {
        method: "POST",
        body: { userId },
      }),
    onSuccess: () => {
      setUserId("");
      onChanged();
      push("Team member added", { tone: "success" });
    },
    onError: (caught) =>
      push("Could not add team member", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      api(`/organizations/${orgId}/teams/${team.id}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => onChanged(),
    onError: (caught) =>
      push("Could not remove team member", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const existing = new Set(team.members.map((member) => member.userId));
  const available = members.filter((member) => !existing.has(member.user.id));

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{team.name}</span>
        {team.department ? <Badge tone="neutral">{team.department.name}</Badge> : null}
        <span className="text-[10px] text-slate-400">{team._count.projects} projects</span>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete team ${team.name}?`)) onDelete();
            }}
            className="ml-auto rounded p-1 text-slate-300 hover:text-red-500"
            aria-label="Delete team"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {team.members.map((member) => (
          <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 py-0.5 pl-0.5 pr-1.5 text-[10px] dark:border-slate-700">
            <Avatar name={member.user.name} color={member.user.avatarColor} size="xs" />
            <span className="text-slate-600 dark:text-slate-300">{member.user.name}</span>
            {member.role === "LEAD" ? <Badge tone="indigo">Lead</Badge> : null}
            {canManage && member.role !== "LEAD" ? (
              <button type="button" onClick={() => removeMember.mutate(member.userId)} className="text-slate-300 hover:text-red-500" aria-label="Remove from team">
                ×
              </button>
            ) : null}
          </span>
        ))}
        {team.members.length === 0 ? <span className="text-[10px] text-slate-400">No members</span> : null}
      </div>
      {canManage && available.length > 0 ? (
        <div className="mt-2 flex gap-2">
          <Select value={userId} onChange={(event) => setUserId(event.target.value)} className="h-7 flex-1 text-[11px]">
            <option value="">Add team member…</option>
            {available.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" disabled={!userId} loading={addMember.isPending} onClick={() => addMember.mutate()}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AuditTab() {
  const { orgId } = useWorkspace();
  const { data, isLoading } = useQuery({
    queryKey: ["audit", orgId],
    queryFn: () => api<{ logs: AuditLog[]; total: number }>(`/organizations/${orgId}/audit-logs?limit=50`),
    enabled: Boolean(orgId),
  });

  if (isLoading || !data) return <PageLoader label="Loading audit log" />;

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        <ShieldCheck className="h-4 w-4 text-slate-400" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Audit log</h2>
          <p className="text-xs text-slate-400">Security-relevant actions across this organization. {data.total} events total.</p>
        </div>
      </div>
      {data.logs.length === 0 ? (
        <EmptyState title="No audit events" description="Role changes, deletions and logins will appear here." className="border-0" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-ink-850/40">
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">Actor</th>
                <th className="px-4 py-2 font-semibold">Action</th>
                <th className="px-4 py-2 font-semibold">Entity</th>
                <th className="px-4 py-2 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {data.logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{log.actor?.name ?? "System"}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{log.action}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {log.entityType ?? "—"}
                    {log.entityId ? <span className="ml-1 text-[10px] text-slate-400">#{log.entityId.slice(-6)}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">{log.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProfileTab({
  user,
}: {
  user: { id: string; name: string; email: string; avatarColor: string; timezone: string };
}) {
  const { push } = useToast();
  const { refresh } = useAuth();
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.avatarColor);
  const [timezone, setTimezone] = useState(user.timezone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const updateProfile = useMutation({
    mutationFn: () =>
      api(`/auth/me`, { method: "PATCH", body: { name, avatarColor: color, timezone } }),
    onSuccess: async () => {
      push("Profile updated", { tone: "success" });
      await refresh();
    },
    onError: (caught) =>
      push("Could not update profile", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api(`/auth/change-password`, {
        method: "POST",
        body: { currentPassword, newPassword },
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      push("Password changed", { message: "Other sessions were revoked.", tone: "success" });
    },
    onError: (caught) =>
      push("Could not change password", {
        message: caught instanceof Error ? caught.message : undefined,
        tone: "error",
      }),
  });

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Profile</h2>
        </div>
        <form onSubmit={submitProfile} className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={name || user.name} color={color} size="lg" />
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user.name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <Field label="Display name">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Avatar color">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  className={cn("h-7 w-7 rounded-lg", color === option && "ring-2 ring-slate-400 ring-offset-2 dark:ring-offset-ink-900")}
                  style={{ backgroundColor: option }}
                  aria-label={`Use ${option}`}
                />
              ))}
            </div>
          </Field>
          <Field label="Timezone" hint="Used for calendar rendering and delivery dates.">
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/New_York" />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" type="submit" loading={updateProfile.isPending}>
              Save profile
            </Button>
          </div>
        </form>
      </div>

      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Password & security</h2>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            changePassword.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Current password" required>
            <Input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" required hint="At least 10 characters.">
            <Input type="password" required minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-500 dark:border-slate-800 dark:bg-ink-850/50 dark:text-slate-400">
            Password changes revoke all refresh tokens and issue a fresh session.
            Sessions are stored as hashed, rotating opaque tokens.
          </div>
          <div className="flex justify-end">
            <Button size="sm" type="submit" loading={changePassword.isPending} disabled={!currentPassword || newPassword.length < 10}>
              Change password
            </Button>
          </div>
        </form>
        <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck className="h-3 w-3" /> Last sign-in activity is recorded in the audit log.
        </p>
      </div>
    </div>
  );
}
