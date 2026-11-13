import type { OrgRole, ProjectRole } from "./types";

export type Capability =
  | "org:manage"
  | "org:read"
  | "members:manage"
  | "structure:manage"
  | "team:manage"
  | "project:create"
  | "project:manage"
  | "workflow:manage"
  | "task:write"
  | "task:delete"
  | "comment:write"
  | "attachment:write"
  | "sprint:manage"
  | "milestone:manage"
  | "report:read"
  | "audit:read";

const ALL: Capability[] = [
  "org:manage",
  "org:read",
  "members:manage",
  "structure:manage",
  "team:manage",
  "project:create",
  "project:manage",
  "workflow:manage",
  "task:write",
  "task:delete",
  "comment:write",
  "attachment:write",
  "sprint:manage",
  "milestone:manage",
  "report:read",
  "audit:read",
];

const ROLE_CAPABILITIES: Record<OrgRole, Capability[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  PROJECT_MANAGER: [
    "org:read",
    "team:manage",
    "project:create",
    "project:manage",
    "workflow:manage",
    "task:write",
    "task:delete",
    "comment:write",
    "attachment:write",
    "sprint:manage",
    "milestone:manage",
    "report:read",
  ],
  TEAM_LEAD: [
    "org:read",
    "team:manage",
    "project:create",
    "project:manage",
    "workflow:manage",
    "task:write",
    "task:delete",
    "comment:write",
    "attachment:write",
    "sprint:manage",
    "milestone:manage",
    "report:read",
  ],
  DEVELOPER: ["org:read", "task:write", "comment:write", "attachment:write", "report:read"],
  VIEWER: ["org:read", "report:read"],
};

export function hasCapability(role: OrgRole | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function projectCapabilities(
  role: OrgRole | undefined,
  projectRole: ProjectRole | null | undefined,
): Set<Capability> {
  const caps = new Set<Capability>(role ? ROLE_CAPABILITIES[role] : []);
  if (projectRole === "MANAGER") {
    (
      [
        "project:manage",
        "workflow:manage",
        "task:write",
        "task:delete",
        "comment:write",
        "attachment:write",
        "sprint:manage",
        "milestone:manage",
        "report:read",
      ] as Capability[]
    ).forEach((capability) => caps.add(capability));
  }
  if (projectRole === "CONTRIBUTOR") {
    (["task:write", "comment:write", "attachment:write", "report:read"] as Capability[]).forEach(
      (capability) => caps.add(capability),
    );
  }
  if (projectRole === "VIEWER") {
    (
      [
        "project:manage",
        "workflow:manage",
        "task:write",
        "task:delete",
        "comment:write",
        "attachment:write",
        "sprint:manage",
        "milestone:manage",
      ] as Capability[]
    ).forEach((capability) => caps.delete(capability));
    caps.add("report:read");
  }
  return caps;
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Organization admin",
  PROJECT_MANAGER: "Project manager",
  TEAM_LEAD: "Team lead",
  DEVELOPER: "Developer",
  VIEWER: "Read-only",
};
