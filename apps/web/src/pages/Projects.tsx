import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FolderKanban, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ProjectModal } from "../components/ProjectModal";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  PageLoader,
  PriorityBadge,
  ProgressBar,
  Select,
  StatusBadge,
  Input,
} from "../components/ui";
import { api } from "../lib/api";
import type { Project, ProjectStatus } from "../lib/types";
import { cn, formatDate, isOverdue } from "../lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function ProjectsPage() {
  const { orgId, can } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(searchParams.get("new") === "1");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ projects: Project[] }>(`/organizations/${orgId}/projects`),
    enabled: Boolean(orgId),
  });

  const projects = useMemo(() => {
    const list = data?.projects ?? [];
    return list.filter((project) => {
      if (status && project.status !== status) return false;
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        project.name.toLowerCase().includes(term) ||
        project.key.toLowerCase().includes(term) ||
        (project.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [data, search, status]);

  if (isLoading) return <PageLoader label="Loading projects" />;

  const activeCount = (data?.projects ?? []).filter((project) => project.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description={`${data?.projects.length ?? 0} projects across your organization · ${activeCount} active`}
        actions={
          can("project:create") ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
              New project
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as ProjectStatus | "")}
          className="sm:w-44"
        >
          <option value="">All statuses</option>
          <option value="PLANNING">Planning</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On hold</option>
          <option value="COMPLETED">Completed</option>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span>{projects.length} shown</span>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title={data?.projects.length ? "No projects match those filters" : "No projects yet"}
          description={
            data?.projects.length
              ? "Try a different search or status."
              : "Create your first project to start planning work with your team."
          }
          action={
            can("project:create") ? (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
                Create project
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="surface group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-500/40"
            >
              <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: project.color }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.key.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-300">
                        {project.name}
                      </h3>
                      <p className="text-[11px] text-slate-400">{project.key}</p>
                    </div>
                  </div>
                </div>
                <StatusBadge status={project.status} />
              </div>

              <p className="mt-3 line-clamp-2 min-h-[36px] text-xs leading-5 text-slate-500 dark:text-slate-400">
                {project.description || "No description yet."}
              </p>

              <div className="mt-4 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">
                  {project.taskStats?.completed ?? 0}/{project.taskStats?.total ?? 0} tasks
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {project.taskStats?.progress ?? 0}%
                </span>
              </div>
              <ProgressBar value={project.taskStats?.progress ?? 0} size="sm" color={project.color} className="mt-1.5" />

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-2">
                  {project.owner ? <Avatar name={project.owner.name} color={project.owner.avatarColor} size="xs" /> : null}
                  <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {project.owner?.name ?? "Unassigned"}
                    {project.team ? ` · ${project.team.name}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate-400">
                  {project._count ? (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {project._count.members}
                    </span>
                  ) : null}
                  {project.dueDate ? (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        isOverdue(project.dueDate) && project.status !== "COMPLETED" && "text-red-500",
                      )}
                    >
                      <CalendarClock className="h-3 w-3" /> {formatDate(project.dueDate)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <PriorityBadge priority={project.priority} />
                {project.team ? <Badge tone="neutral">{project.team.name}</Badge> : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <ProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(project) => navigate(`/projects/${project.id}`)}
      />
    </div>
  );
}
