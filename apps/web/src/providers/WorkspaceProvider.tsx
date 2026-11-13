import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hasCapability, type Capability } from "../lib/permissions";
import type { MembershipInfo, OrgRole } from "../lib/types";
import { useAuth } from "./AuthProvider";

type WorkspaceContextValue = {
  membership: MembershipInfo | null;
  orgId: string | null;
  role: OrgRole | undefined;
  organizations: MembershipInfo[];
  setOrgId: (organizationId: string) => void;
  can: (capability: Capability) => boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const organizations = useMemo(() => user?.memberships ?? [], [user]);
  const [orgId, setOrgIdState] = useState<string | null>(null);

  useEffect(() => {
    if (organizations.length === 0) {
      setOrgIdState(null);
      return;
    }
    const stored = (() => {
      try {
        return localStorage.getItem("tf_org");
      } catch {
        return null;
      }
    })();
    const exists = organizations.some((membership) => membership.organizationId === orgId);
    if (exists) return;
    const preferred =
      organizations.find((membership) => membership.organizationId === stored) ?? organizations[0];
    setOrgIdState(preferred.organizationId);
  }, [organizations, orgId]);

  const setOrgId = useCallback((next: string) => {
    setOrgIdState(next);
    try {
      localStorage.setItem("tf_org", next);
    } catch {
      // ignore storage access errors
    }
  }, []);

  const membership = useMemo(
    () => organizations.find((candidate) => candidate.organizationId === orgId) ?? organizations[0] ?? null,
    [organizations, orgId],
  );

  const role = membership?.role;
  const can = useCallback(
    (capability: Capability) => hasCapability(role, capability),
    [role],
  );

  const value = useMemo(
    () => ({
      membership,
      orgId: membership?.organizationId ?? null,
      role,
      organizations,
      setOrgId,
      can,
    }),
    [membership, role, organizations, setOrgId, can],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
