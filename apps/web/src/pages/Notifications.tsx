import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, CheckCircle2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  PageLoader,
  Spinner,
} from "../components/ui";
import { api } from "../lib/api";
import type { Notification, Task } from "../lib/types";
import { cn, relativeTime } from "../lib/utils";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";

const TYPE_TONE: Record<string, "indigo" | "green" | "amber" | "pink" | "sky" | "neutral"> = {
  TASK_ASSIGNED: "indigo",
  TASK_UPDATED: "sky",
  TASK_COMMENTED: "pink",
  SPRINT_STARTED: "green",
  SPRINT_COMPLETED: "green",
  MILESTONE_DUE: "amber",
  ADDED_TO_PROJECT: "indigo",
  INVITATION: "sky",
};

export function NotificationsPage() {
  const { orgId } = useWorkspace();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", orgId, "full"],
    queryFn: () =>
      api<{ notifications: Notification[]; unreadCount: number }>("/notifications?limit=100"),
    enabled: Boolean(orgId),
  });

  const markAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      push("All notifications read", { tone: "success" });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  async function openNotification(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.entityType === "Project" && notification.entityId) {
      navigate(`/projects/${notification.entityId}`);
      return;
    }
    if (notification.entityType === "Task" && notification.entityId) {
      try {
        const response = await api<{ task: Task }>(`/tasks/${notification.entityId}`);
        navigate(`/projects/${response.task.projectId}?task=${response.task.id}`);
      } catch {
        push("That task is no longer available", { tone: "info" });
      }
      return;
    }
    if (notification.type === "INVITATION") navigate("/settings?tab=invitations");
  }

  if (isLoading || !data) return <PageLoader label="Loading notifications" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={data.unreadCount > 0 ? `${data.unreadCount} unread updates` : "You are all caught up."}
        actions={
          data.unreadCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              icon={<CheckCheck className="h-4 w-4" />}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          ) : null
        }
      />

      {data.notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No notifications"
          description="Assignment, comment, sprint and invitation updates will appear here."
        />
      ) : (
        <div className="surface divide-y divide-slate-100 dark:divide-slate-800">
          {data.notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3.5 transition",
                !notification.readAt && "bg-indigo-50/40 dark:bg-indigo-500/5",
              )}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {notification.readAt ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Bell className="h-4 w-4 text-indigo-500" />}
              </span>
              <button type="button" onClick={() => void openNotification(notification)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{notification.title}</p>
                  <Badge tone={TYPE_TONE[notification.type] ?? "neutral"}>{notification.type.toLowerCase().replace(/_/g, " ")}</Badge>
                  {!notification.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> : null}
                </div>
                {notification.body ? (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{notification.body}</p>
                ) : null}
                <p className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                  {notification.organization ? (
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: notification.organization.logoColor }} />
                      {notification.organization.name}
                    </span>
                  ) : null}
                  <span>{relativeTime(notification.createdAt)}</span>
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                {!notification.readAt ? (
                  <button
                    type="button"
                    onClick={() => markRead.mutate(notification.id)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    title="Mark as read"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove.mutate(notification.id)}
                  className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                  title="Delete notification"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {markRead.isPending || remove.isPending ? (
        <p className="flex items-center gap-2 text-[10px] text-slate-400">
          <Spinner className="h-3 w-3" /> Updating…
        </p>
      ) : null}
    </div>
  );
}
