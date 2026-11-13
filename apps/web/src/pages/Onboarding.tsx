import { ArrowLeft, Building2, Check, LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/AuthShell";
import { Button, Field, Input, Textarea } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#0ea5e9", "#14b8a6", "#ef4444"];

export function OnboardingPage() {
  const { user, refresh, logout } = useAuth();
  const { organizations, setOrgId } = useWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdditional = organizations.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await api<{ organization: { id: string } }>("/organizations", {
        method: "POST",
        body: { name, description: description.trim() || undefined, logoColor: color },
      });
      await refresh();
      setOrgId(response.organization.id);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <BrandMark />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:block">{user?.email}</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut className="h-3.5 w-3.5" />}
            onClick={() => {
              void logout();
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-6 pb-16 pt-6 sm:pt-12">
        {isAdditional ? (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to workspace
          </button>
        ) : null}

        <div className="surface p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                {isAdditional ? "Create another organization" : "Create your organization"}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Departments, teams, projects and permissions live inside this boundary.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Organization name" required>
              <Input
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Northwind Labs"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="Optional. A sentence about what your team builds.">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Product engineering organization building developer infrastructure."
                rows={3}
              />
            </Field>
            <Field label="Brand color">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition",
                      color === option ? "ring-2 ring-slate-400 ring-offset-2 dark:ring-slate-500 dark:ring-offset-ink-900" : "",
                    )}
                    style={{ backgroundColor: option }}
                    aria-label={`Select ${option}`}
                  >
                    {color === option ? <Check className="h-4 w-4 text-white" /> : null}
                  </button>
                ))}
              </div>
            </Field>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" loading={loading}>
              Create organization
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-5 text-slate-400">
            You will become the organization owner. Invite teammates and assign roles after setup.
          </p>
        </div>

        {!isAdditional ? (
          <p className="mt-5 text-center text-xs text-slate-400">
            Have an invitation?{" "}
            <Link to="/login" className="font-semibold text-indigo-600 dark:text-indigo-400">
              Check your email link
            </Link>
          </p>
        ) : null}
      </main>
    </div>
  );
}
