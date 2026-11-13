import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { Button, Field, Input } from "../components/ui";
import { useAuth } from "../providers/AuthProvider";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({
        name,
        email,
        password,
        organizationName: organizationName.trim() || undefined,
      });
      navigate(from && from !== "/register" ? from : "/", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create your account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Start with an organization, then invite your team."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            state={{ from }}
            className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required>
          <Input
            required
            minLength={2}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
          />
        </Field>
        <Field label="Work email" required>
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password" required hint="At least 10 characters.">
          <Input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Choose a strong password"
          />
        </Field>
        <Field
          label="Organization name"
          hint="Optional. Leave blank to join an organization later via invitation."
        >
          <Input
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="Northwind Labs"
          />
        </Field>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={loading}>
          Create account
          {!loading ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
        <p className="text-center text-[11px] leading-5 text-slate-400">
          By creating an account you agree to keep your workspace data secure and
          use TeamFlow only for authorized team collaboration.
        </p>
      </form>
    </AuthShell>
  );
}
