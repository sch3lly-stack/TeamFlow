export const DEFAULT_ORG_SETTINGS = {
  weekStart: "monday",
  defaultPriority: "MEDIUM",
  workloadThresholds: { openTasks: 8, estimatedHours: 40 },
  notifications: { realtime: true, emailInvites: false },
};

export const DEFAULT_TASK_CATEGORIES = [
  { name: "Feature", color: "#6366f1" },
  { name: "Bug", color: "#ef4444" },
  { name: "Chore", color: "#64748b" },
  { name: "Research", color: "#0ea5e9" },
  { name: "Design", color: "#ec4899" },
];

export const DEFAULT_PROJECT_COLUMNS = [
  { name: "Backlog", position: 0, isDone: false },
  { name: "To Do", position: 1, isDone: false },
  { name: "In Progress", position: 2, isDone: false },
  { name: "In Review", position: 3, isDone: false },
  { name: "Done", position: 4, isDone: true },
];

export const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
];

export function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? "#6366f1";
}
