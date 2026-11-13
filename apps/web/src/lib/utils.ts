import clsx, { type ClassValue } from "clsx";
import { differenceInCalendarDays, format, formatDistanceToNow, isPast, isToday } from "date-fns";

export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatDate(value: string | Date | null | undefined, pattern = "MMM d"): string {
  if (!value) return "—";
  return format(new Date(value), pattern);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "MMM d, yyyy 'at' h:mm a");
}

export function relativeTime(value: string | Date): string {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  return isPast(new Date(value)) && !isToday(new Date(value));
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  return differenceInCalendarDays(new Date(value), new Date());
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export const PRIORITY_DOT: Record<string, string> = {
  LOW: "bg-slate-400",
  MEDIUM: "bg-sky-500",
  HIGH: "bg-orange-500",
  URGENT: "bg-red-500",
};

export const STATUS_STYLES: Record<string, string> = {
  PLANNING: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ON_HOLD: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  COMPLETED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  ARCHIVED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  PLANNED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  PENDING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  AT_RISK: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  REVOKED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  EXPIRED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  ACCEPTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export const CHART_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#0ea5e9"];

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}
