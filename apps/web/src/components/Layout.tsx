import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { Notification } from "../lib/types";
import { cn } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { ROLE_LABELS } from "../lib/permissions";
import { Avatar, Dropdown, MenuItem } from "./ui";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/my-work", label: "My work", icon: ListTodo },
] as const;

const TEAM_ITEMS = [
  { to: "/workload", label: "Workload", icon: Users },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h11M4 17h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
        TeamFlow
      </span>
    </Link>
  );
}

function OrgSwitcher() {
  const { organizations, membership, setOrgId } = useWorkspace();
  const navigate = useNavigate();

  if (!membership) return null;

  return (
    <Dropdown
      trigger={
        <span className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-slate-300 dark:border-slate-800 dark:bg-ink-850 dark:hover:border-slate-700">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: membership.organization.logoColor }}
          >
            {membership.organization.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {membership.organization.name}
            </span>
            <span className="block truncate text-[11px] text-slate-400">
              {ROLE_LABELS[membership.role]}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        </span>
      }
      panelClassName="w-[250px]"
    >
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Organizations
      </div>
      {organizations.map((item) => (
        <MenuItem
          key={item.organizationId}
          active={item.organizationId === membership.organizationId}
          onClick={() => setOrgId(item.organizationId)}
          icon={
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-white"
              style={{ backgroundColor: item.organization.logoColor }}
            >
              {item.organization.name.slice(0, 2).toUpperCase()}
            </span>
          }
        >
          {item.organization.name}
        </MenuItem>
      ))}
      <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />
      <MenuItem
        onClick={() => navigate("/onboarding?new=1")}
        icon={<Plus className="h-4 w-4" />}
      >
        New organization
      </MenuItem>
    </Dropdown>
  );
}

function SearchResults() {
  const { orgId } = useWorkspace();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", orgId, debounced],
    queryFn: () =>
      api<{
        tasks: { id: string; number: number; title: string; project: { id: string; key: string; name: string } }[];
        projects: { id: string; name: string; key: string }[];
        people: { user: { id: string; name: string; email: string; avatarColor: string } }[];
      }>(`/organizations/${orgId}/search?q=${encodeURIComponent(debounced)}`),
    enabled: Boolean(orgId) && debounced.length >= 2,
  });

  const open = focused && term.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="Search tasks, projects, people…"
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-16 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-800 dark:bg-ink-850 dark:text-slate-100"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 lg:block dark:border-slate-700">
        ⌘K
      </kbd>
      {open ? (
        <div className="absolute left-0 right-0 top-11 z-50 animate-scale-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-float dark:border-slate-700 dark:bg-ink-850">
          {isFetching && !data ? (
            <p className="px-3 py-4 text-xs text-slate-400">Searching…</p>
          ) : !data || (data.tasks.length === 0 && data.projects.length === 0 && data.people.length === 0) ? (
            <p className="px-3 py-4 text-xs text-slate-400">No matches for “{debounced}”.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto p-1.5">
              {data.projects.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Projects</p>
                  {data.projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setTerm("");
                        setFocused(false);
                        navigate(`/projects/${project.id}`);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <FolderKanban className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium">{project.name}</span>
                      <span className="text-[11px] text-slate-400">{project.key}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {data.tasks.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tasks</p>
                  {data.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setTerm("");
                        setFocused(false);
                        navigate(`/projects/${task.project.id}?task=${task.id}`);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="w-14 shrink-0 text-[10px] font-semibold text-slate-400">{task.project.key}-{task.number}</span>
                      <span className="truncate">{task.title}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {data.people.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">People</p>
                  {data.people.map(({ user }) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setTerm("");
                        setFocused(false);
                        navigate("/settings?tab=members");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Avatar name={user.name} color={user.avatarColor} size="xs" />
                      <span className="truncate">{user.name}</span>
                      <span className="truncate text-[11px] text-slate-400">{user.email}</span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useRealtime() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { push } = useToast();

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket();

    const invalidateWorkspace = () => {
      for (const key of [
        "dashboard",
        "projects",
        "project",
        "tasks",
        "task",
        "sprints",
        "sprint",
        "milestones",
        "analytics",
        "projectAnalytics",
        "workload",
        "activity",
        "calendar",
        "mywork",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    };

    const events = [
      "task:created",
      "task:updated",
      "task:moved",
      "task:deleted",
      "comment:created",
      "comment:updated",
      "comment:deleted",
      "project:created",
      "project:updated",
      "project:member_updated",
      "sprint:updated",
      "milestone:updated",
      "workflow:updated",
      "attachment:created",
      "attachment:deleted",
      "activity:created",
    ];

    for (const event of events) socket.on(event, invalidateWorkspace);

    const onNotification = (notification: Notification) => {
      push(notification.title, {
        message: notification.body ?? undefined,
        tone: "info",
      });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    socket.on("notification", onNotification);

    return () => {
      for (const event of events) socket.off(event, invalidateWorkspace);
      socket.off("notification", onNotification);
    };
  }, [user, queryClient, push]);
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { membership, orgId } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useRealtime();

  const { data: notificationData } = useQuery({
    queryKey: ["notifications", orgId],
    queryFn: () =>
      api<{ unreadCount: number }>("/notifications?limit=1&unreadOnly=true"),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const unreadCount = notificationData?.unreadCount ?? 0;

  const navGroups = useMemo(
    () => [
      { label: "Workspace", items: NAV_ITEMS },
      { label: "Team", items: TEAM_ITEMS },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-200 bg-slate-100/70 px-3 py-4 backdrop-blur transition-transform dark:border-slate-800 dark:bg-ink-900/70 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-1">
          <Brand />
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 px-1">
          <OrgSwitcher />
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-5 overflow-y-auto px-1 pb-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={"end" in item ? item.end : false}
                      className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Account
            </p>
            <div className="space-y-0.5">
              <NavLink to="/notifications" className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}>
                <Bell className="h-4 w-4" />
                <span className="flex-1">Notifications</span>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}>
                <Settings className="h-4 w-4" />
                Settings
              </NavLink>
            </div>
          </div>
        </nav>

        <div className="mt-auto rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-ink-850">
          <div className="flex items-center gap-2.5">
            {user ? <Avatar name={user.name} color={user.avatarColor} /> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-400">
                {membership ? ROLE_LABELS[membership.role] : user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                void logout();
                navigate("/login");
              }}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-slate-50/85 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-ink-950/80 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <SearchResults />
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to="/notifications"
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-slate-50 dark:ring-ink-950" />
              ) : null}
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            {user ? (
              <Dropdown
                trigger={
                  <span className="flex items-center gap-1.5 rounded-full p-0.5 transition hover:bg-slate-200/70 dark:hover:bg-slate-800">
                    <Avatar name={user.name} color={user.avatarColor} size="md" />
                  </span>
                }
              >
                <div className="px-2.5 py-2">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-slate-400">{user.email}</p>
                </div>
                <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />
                <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => navigate("/settings")}>
                  Account settings
                </MenuItem>
                <MenuItem
                  danger
                  icon={<LogOut className="h-4 w-4" />}
                  onClick={() => {
                    void logout();
                    navigate("/login");
                  }}
                >
                  Sign out
                </MenuItem>
              </Dropdown>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
