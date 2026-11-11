import { focusSegments, minute, type Data } from "./domain.js";

export function dayWindow(now: number, offset = 0) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: +start, end: +end, date: start };
}
export function taskTotals(data: Data, now: number, days = 1, offset = 0) {
  const end = dayWindow(now, offset).end,
    start = dayWindow(now, offset - days + 1).start;
  const totals = new Map<string | null, number>();
  for (const segment of focusSegments(data, now)) {
    const ms = Math.max(0, Math.min(segment.end, end) - Math.max(segment.start, start));
    if (ms) {
      const id = segment.taskId ?? null;
      totals.set(id, (totals.get(id) ?? 0) + ms);
    }
  }
  return totals;
}
export function taskProgress(data: Data, taskId: string, now: number, actual?: number) {
  const goal = data.goals.find((goal) => goal.taskId === taskId && goal.enabled);
  const ms = actual ?? taskTotals(data, now).get(taskId) ?? 0;
  const scheduled = !!goal?.weekdays.includes(new Date(now).getDay());
  const target = goal ? goal.targetMinutes * minute : 0;
  return {
    goal,
    ms,
    target,
    scheduled,
    complete: scheduled && ms >= target,
    percent: target ? Math.min(100, Math.max(0, (ms / target) * 100)) : 0,
  };
}
export function taskLabel(data: Data, id: string | null | undefined) {
  if (!id) return "General";
  const task = data.tasks.find((task) => task.id === id);
  return task
    ? `${task.icon ? task.icon + " " : ""}${task.name}${task.archived ? " (archived)" : ""}`
    : "Deleted task";
}
export function focusDuration(ms: number) {
  const minutes = Math.floor(ms / minute);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;
}
