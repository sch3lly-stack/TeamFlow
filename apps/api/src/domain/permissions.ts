import type { OrgRole, ProjectRole } from "@prisma/client";

export const CAPABILITIES = [
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
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const set = (values: Capability[]) => new Set<Capability>(values);

const ALL = set([...CAPABILITIES]);

/** Organization-level capabilities derived from the user's membership role. */
export const ORG_ROLE_CAPABILITIES: Record<OrgRole, ReadonlySet<Capability>> = {
  OWNER: ALL,
  ADMIN: ALL,
  PROJECT_MANAGER: set([
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
  ]),
  TEAM_LEAD: set([
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
  ]),
  DEVELOPER: set([
    "org:read",
    "task:write",
    "comment:write",
    "attachment:write",
    "report:read",
  ]),
  VIEWER: set(["org:read", "report:read"]),
};

/** Additional capabilities granted by an explicit project membership. */
export const PROJECT_ROLE_CAPABILITIES: Record<ProjectRole, ReadonlySet<Capability>> = {
  MANAGER: set([
    "project:manage",
    "workflow:manage",
    "task:write",
    "task:delete",
    "comment:write",
    "attachment:write",
    "sprint:manage",
    "milestone:manage",
    "report:read",
  ]),
  CONTRIBUTOR: set(["task:write", "comment:write", "attachment:write", "report:read"]),
  VIEWER: set(["report:read"]),
};

const WRITE_CAPABILITIES: Capability[] = [
  "project:manage",
  "workflow:manage",
  "task:write",
  "task:delete",
  "comment:write",
  "attachment:write",
  "sprint:manage",
  "milestone:manage",
];

export function can(role: OrgRole, capability: Capability): boolean {
  return ORG_ROLE_CAPABILITIES[role].has(capability);
}

/**
 * Effective capabilities for a user inside a project.
 * A project-level VIEWER is a hard restriction: it removes write access even
 * when the organization role would otherwise allow it.
 */
export function effectiveCapabilities(
  orgRole: OrgRole,
  projectRole?: ProjectRole | null,
): Set<Capability> {
  const capabilities = new Set<Capability>(ORG_ROLE_CAPABILITIES[orgRole]);
  if (projectRole) {
    for (const capability of PROJECT_ROLE_CAPABILITIES[projectRole]) {
      capabilities.add(capability);
    }
    if (projectRole === "VIEWER") {
      for (const capability of WRITE_CAPABILITIES) capabilities.delete(capability);
    }
  }
  return capabilities;
}

export function isOrgAdmin(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function assignableRoles(actorRole: OrgRole): OrgRole[] {
  if (actorRole === "OWNER") {
    return ["OWNER", "ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "DEVELOPER", "VIEWER"];
  }
  if (actorRole === "ADMIN") {
    return ["ADMIN", "PROJECT_MANAGER", "TEAM_LEAD", "DEVELOPER", "VIEWER"];
  }
  return [];
}
