export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

/** Start of the ISO week (Monday) at 00:00 UTC. */
export function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(copy, diff);
}

export function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000));
}
