import { BarChart3, Check, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-5 w-5" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h11M4 17h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">TeamFlow</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Engineering operations</p>
        </div>
      ) : null}
    </div>
  );
}

const FEATURES = [
  "Organization-scoped projects, teams and permissions",
  "Kanban boards, sprints and dependency tracking",
  "Workload planning and delivery analytics",
  "Real-time activity, comments and notifications",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr] dark:bg-ink-950">
      <div className="relative hidden overflow-hidden bg-ink-950 px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="grid-noise absolute inset-0 opacity-60" />
        <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[110px]" />
        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h11M4 17h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">TeamFlow</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Engineering operations</p>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-lg py-14">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-indigo-200 backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Built for engineering teams that ship
          </div>
          <h1 className="text-[38px] font-semibold leading-[1.08] tracking-tight">
            Plan the work.
            <br />
            See the whole system.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            TeamFlow connects projects, sprints, workload and delivery signals in one
            tenant-isolated workspace.
          </p>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
                  <Check className="h-3 w-3" />
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <BarChart3 className="h-4 w-4 text-indigo-300" />
                Sprint 12 · delivery pulse
              </div>
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                On track
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Open work", "18"],
                ["Completed", "42"],
                ["Cycle time", "3.2d"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-black/20 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-0.5 text-base font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3.5 space-y-2">
              {[
                ["Atlas API Platform", 72],
                ["Nimbus Design System", 48],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                    <span>{label}</span>
                    <span>{value}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="relative z-10 flex items-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Tenant isolation, role-based access, audited actions
        </p>
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mb-8 lg:hidden">
          <BrandMark />
        </div>
        <div className="mx-auto w-full max-w-[400px]">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
