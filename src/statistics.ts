import { focusSegments, type Data } from "./domain.js";

export type StatsPeriod = "day" | "week" | "month" | "year";

export function calendarPeriod(now: number, period: StatsPeriod, offset = 0) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "day") start.setDate(start.getDate() + offset);
  else if (period === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  else {
    start.setDate(1);
    if (period === "month") start.setMonth(start.getMonth() + offset);
    else start.setFullYear(start.getFullYear() + offset, 0, 1);
  }
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  else if (period === "week") end.setDate(end.getDate() + 7);
  else if (period === "month") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return { start: +start, end: +end };
}

export function periodStatistics(
  data: Data,
  now: number,
  period: StatsPeriod,
  offset = 0,
) {
  const window = calendarPeriod(now, period, offset);
  const buckets = [];
  const cursor = new Date(window.start);
  while (+cursor < window.end) {
    const next = new Date(cursor);
    if (period === "day") next.setTime(Math.min(window.end, +cursor + 3600000));
    else if (period === "year") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);
    buckets.push({
      date: new Date(cursor),
      start: +cursor,
      end: +next,
      ms: 0,
      upcoming: +cursor > now,
    });
    cursor.setTime(+next);
  }
  const taskTotals = new Map<string | null, number>();
  for (const segment of focusSegments(data, now)) {
    const start = Math.max(window.start, segment.start);
    const end = Math.min(window.end, segment.end, now);
    if (end <= start) continue;
    const id = segment.taskId ?? null;
    taskTotals.set(id, (taskTotals.get(id) ?? 0) + end - start);
    for (const bucket of buckets)
      bucket.ms += Math.max(0, Math.min(end, bucket.end) - Math.max(start, bucket.start));
  }
  return {
    ...window,
    buckets,
    taskTotals,
    total: [...taskTotals.values()].reduce((sum, ms) => sum + ms, 0),
  };
}
