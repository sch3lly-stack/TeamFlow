import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, PageHeader, PageLoader, Select } from "../components/ui";
import { api } from "../lib/api";
import type { CalendarEvent, Project } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";

const TYPE_STYLES: Record<string, string> = {
  task: "bg-indigo-500",
  milestone: "bg-pink-500",
  sprint: "bg-emerald-500",
};

export function CalendarPage() {
  const { orgId } = useWorkspace();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const [projectId, setProjectId] = useState("");

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ projects: Project[] }>(`/organizations/${orgId}/projects`),
    enabled: Boolean(orgId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", orgId, gridStart.toISOString(), gridEnd.toISOString(), projectId],
    queryFn: () =>
      api<{ events: CalendarEvent[] }>(
        `/organizations/${orgId}/calendar?from=${gridStart.toISOString()}&to=${gridEnd.toISOString()}${projectId ? `&projectId=${projectId}` : ""}`,
      ),
    enabled: Boolean(orgId),
  });

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of data?.events ?? []) {
    const key = format(new Date(event.date), "yyyy-MM-dd");
    const list = eventsByDay.get(key) ?? [];
    list.push(event);
    eventsByDay.set(key, list);
  }

  function openEvent(event: CalendarEvent) {
    if (event.type === "task") {
      navigate(`/projects/${event.project.id}?task=${event.entityId}`);
    } else if (event.type === "milestone") {
      navigate(`/projects/${event.project.id}?tab=milestones`);
    } else {
      navigate(`/projects/${event.project.id}?tab=sprints`);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Deadlines, milestones and sprint windows across the organization."
        actions={
          <div className="flex items-center gap-2">
            <Select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="w-44">
              <option value="">All projects</option>
              {(projectsData?.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-ink-850">
              <button
                type="button"
                onClick={() => setCursor(subMonths(cursor, 1))}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[120px] px-1 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">
                {format(cursor, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setCursor(addMonths(cursor, 1))}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
              Today
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Task due dates</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pink-500" /> Milestones</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Sprints</span>
        <span className="ml-auto flex items-center gap-1"><Filter className="h-3 w-3" /> {data?.events.length ?? 0} events this view</span>
      </div>

      {isLoading ? (
        <PageLoader label="Loading calendar" />
      ) : (
        <div className="surface overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-ink-850/40">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const events = eventsByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[108px] border-b border-r border-slate-100 p-1.5 last:border-r-0 dark:border-slate-800/70",
                    !isSameMonth(day, cursor) && "bg-slate-50/50 dark:bg-ink-950/40",
                    isToday(day) && "bg-indigo-50/40 dark:bg-indigo-500/5",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                        isToday(day)
                          ? "bg-indigo-600 text-white"
                          : isSameMonth(day, cursor)
                            ? "text-slate-600 dark:text-slate-300"
                            : "text-slate-300 dark:text-slate-600",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {events.length > 0 ? <span className="text-[9px] text-slate-400">{events.length}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openEvent(event)}
                        title={event.title}
                        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] transition hover:bg-white dark:hover:bg-slate-800"
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TYPE_STYLES[event.type])} />
                        <span className={cn("truncate", event.isDone && "line-through opacity-50")}>{event.title}</span>
                      </button>
                    ))}
                    {events.length > 3 ? <p className="px-1 text-[9px] text-slate-400">+{events.length - 3} more</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <CalendarDays className="h-3 w-3" />
        Calendar events are generated from tasks, milestones and sprints. The API shape is adapter-ready for external calendar sync.
      </p>
    </div>
  );
}
