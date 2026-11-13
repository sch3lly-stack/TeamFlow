import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, MailWarning, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BrandMark } from "../components/AuthShell";
import { Avatar, Button, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { ROLE_LABELS } from "../lib/permissions";
import type { OrgRole } from "../lib/types";
import { formatDate } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";

type InvitationInfo = {
  email: string;
  role: OrgRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  organization: { id: string; name: string; slug: string; logoColor: string };
  invitedBy: { id: string; name: string } | null;
};

export function InvitePage() {
  const { token = "" } = useParams();
  const { user, logout, refresh } = useAuth();
  const { setOrgId } = useWorkspace();
  const { push } = useToast();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<{ invitation: InvitationInfo }>(`/invitations/${token}`),
    enabled: Boolean(token),
  });

  const invitation = data?.invitation;
  const emailMatches = Boolean(
    invitation && user && invitation.email.toLowerCase() === user.email.toLowerCase(),
  );

  async function accept() {
    setError(null);
    setAccepting(true);
    try {
      const response = await api<{ organization: { id: string; name: string } }>(
        `/invitations/${token}/accept`,
        { method: "POST" },
      );
      await refresh();
      setOrgId(response.organization.id);
      push("Invitation accepted", { message: `Welcome to ${response.organization.name}.`, tone: "success" });
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to accept the invitation");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>

        <div className="surface p-6 sm:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-400">
              <Spinner />
              Checking invitation…
            </div>
          ) : isError || !invitation ? (
            <div className="text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-red-400" />
              <h1 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
                Invitation not found
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                This invite link is invalid or has already been removed.
              </p>
              <Link
                to="/login"
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-400"
              >
                Go to sign in <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: invitation.organization.logoColor }}
                >
                  {invitation.organization.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Organization invitation
                  </p>
                  <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                    {invitation.organization.name}
                  </h1>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-ink-850/60">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Invited email</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{invitation.email}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Role</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {ROLE_LABELS[invitation.role]}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Expires</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatDate(invitation.expiresAt, "MMM d, yyyy")}
                  </span>
                </div>
                {invitation.invitedBy ? (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 dark:text-slate-400">Invited by</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {invitation.invitedBy.name}
                    </span>
                  </div>
                ) : null}
              </div>

              {invitation.status !== "PENDING" ? (
                <div className="mt-5 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
                  This invitation is {invitation.status.toLowerCase()} and can no longer be used.
                </div>
              ) : !user ? (
                <div className="mt-5 space-y-3">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Sign in or create an account with <strong>{invitation.email}</strong> to accept.
                  </p>
                  <div className="flex gap-2">
                    <Link
                      to="/login"
                      state={{ from: `/invite/${token}` }}
                      className="flex-1"
                    >
                      <Button className="w-full">Sign in</Button>
                    </Link>
                    <Link
                      to="/register"
                      state={{ from: `/invite/${token}` }}
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full">
                        Create account
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : !emailMatches ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
                    You are signed in as {user.email}. This invitation belongs to {invitation.email}.
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      void logout();
                      navigate(`/login`, { state: { from: `/invite/${token}` } });
                    }}
                  >
                    Sign in with a different account
                  </Button>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    {user ? <Avatar name={user.name} color={user.avatarColor} size="sm" /> : null}
                    Signed in as <strong>{user.email}</strong>
                  </div>
                  {error ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      {error}
                    </p>
                  ) : null}
                  <Button className="w-full" loading={accepting} onClick={accept} icon={<CheckCircle2 className="h-4 w-4" />}>
                    Accept invitation
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
