import {
  updateTasks,
  validateCatalog,
  type Task,
  type DailyGoal,
  type TaskAction,
} from "./tasks.js";
export type Mode = "idle" | "focus" | "break" | "breakDone";
export interface Segment {
  start: number;
  end: number;
  kind: "focus" | "break";
  taskId?: string | null;
}
export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  outcome?: "finished" | "interrupted";
  targetMs: number;
  plannedMs?: number;
  focusMs: number;
  breakMs: number;
  segments: Segment[];
  taskId?: string | null;
}
export interface Timer {
  completedAt?: number;
  mode: Mode;
  paused: boolean;
  anchor: number | null;
  breakTargetMs: number;
  breakElapsedMs: number;
  notified: boolean;
  session: Session | null;
}
export interface Settings {
  focus: number;
  break: number;
  notifications: boolean;
  sound: boolean;
  blocking: boolean;
  sites: string[];
  theme: "system" | "light" | "dark";
  showDuration: boolean;
  showTask: boolean;
  liquidEffect: boolean;
}
export interface Data {
  version: 2;
  defaultsVersion?: 1 | 2 | 3;
  timer: Timer;
  settings: Settings;
  history: Session[];
  tasks: Task[];
  goals: DailyGoal[];
  selectedTaskId: string | null;
}
export const minute = 60_000;
export const focusActionWindow = 30_000;
export const focusPresets = [10, 20, 30, 60, 90, 180];
export const emptyTimer = (): Timer => ({
  mode: "idle",
  paused: false,
  anchor: null,
  breakTargetMs: 0,
  breakElapsedMs: 0,
  notified: false,
  session: null,
});
export const defaults = (): Data => ({
  version: 2,
  defaultsVersion: 3,
  timer: emptyTimer(),
  settings: {
    focus: 10,
    break: 5,
    notifications: true,
    sound: false,
    blocking: false,
    sites: [],
    theme: "system",
    showDuration: true,
    showTask: true,
    liquidEffect: true,
  },
  history: [],
  tasks: [],
  goals: [],
  selectedTaskId: null,
});
export function duration(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 720)
    throw new Error("Choose a duration from 1 to 720 minutes.");
  return Math.round(n * minute);
}
export function site(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname.includes(".") ||
    url.port ||
    url.username ||
    url.password ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    throw new Error("Enter a website domain, such as youtube.com.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
export function elapsed(t: Timer, now: number): number {
  return t.anchor === null ? 0 : Math.max(0, now - t.anchor);
}
export function focusTime(t: Timer, now: number): number {
  return (t.session?.focusMs ?? 0) + (t.mode === "focus" ? elapsed(t, now) : 0);
}
export function remaining(t: Timer, now: number): number {
  return t.mode === "focus"
    ? (t.session?.targetMs ?? 0) - focusTime(t, now)
    : t.breakTargetMs - t.breakElapsedMs - elapsed(t, now);
}
function settle(t: Timer, now: number) {
  if (t.anchor === null || !t.session) return;
  const delta = elapsed(t, now);
  if (delta > 0)
    t.session.segments.push({
      start: t.anchor,
      end: t.anchor + delta,
      kind: t.mode === "focus" ? "focus" : "break",
      taskId: t.session.taskId ?? null,
    });
  if (t.mode === "focus") t.session.focusMs += delta;
  else {
    t.session.breakMs += delta;
    t.breakElapsedMs += delta;
  }
  t.anchor = now;
}
function archive(d: Data, now: number, outcome: "finished" | "interrupted") {
  const t = d.timer;
  if (!t.session) return;
  if (t.mode === "focus") settle(t, now);
  if (t.mode === "break")
    settle(
      t,
      Math.min(now, (t.anchor ?? now) + Math.max(0, t.breakTargetMs - t.breakElapsedMs)),
    );
  t.session.endedAt = now;
  t.session.outcome = outcome;
  if (!d.history.some((s) => s.id === t.session!.id)) d.history.push(t.session);
  d.timer = emptyTimer();
}
export function migrate(input: unknown, now: number): Data {
  if (!input || typeof input !== "object")
    throw new Error("Invalid saved Flow data. It has not been replaced.");
  const raw = input as Data;
  if (
    ![1, 2].includes(raw.version) ||
    !raw.settings ||
    !raw.timer ||
    !Array.isArray(raw.history)
  )
    throw new Error(
      "Unsupported or incomplete saved Flow data. It has not been replaced.",
    );
  let d = structuredClone(raw);
  if (raw.version === 2 && (!Array.isArray(raw.tasks) || !Array.isArray(raw.goals)))
    throw new Error("Incomplete saved task data. Your data has not been replaced.");
  const checked = validateData(raw);
  d.history = checked.history;
  d.settings = checked.settings;
  const catalog = validateCatalog(d.tasks ?? [], d.goals ?? []);
  d.tasks = catalog.tasks;
  d.goals = catalog.goals;
  d.version = 2;
  d.selectedTaskId =
    typeof d.selectedTaskId === "string" &&
    d.tasks.some((task) => task.id === d.selectedTaskId && !task.archived)
      ? d.selectedTaskId
      : null;
  if (
    !["idle", "focus", "break", "breakDone"].includes(d.timer.mode) ||
    typeof d.timer.paused !== "boolean" ||
    (d.timer.anchor !== null && !Number.isFinite(d.timer.anchor)) ||
    (d.timer.mode !== "idle" &&
      (!d.timer.session || !Array.isArray(d.timer.session.segments)))
  )
    throw new Error("Invalid saved timer. Your data has not been replaced.");
  for (const value of [d.timer.breakTargetMs, d.timer.breakElapsedMs])
    if (!Number.isFinite(value) || value < 0)
      throw new Error("Invalid saved break timer. Your data has not been replaced.");
  if (
    d.timer.completedAt !== undefined &&
    (!Number.isFinite(d.timer.completedAt) ||
      d.timer.mode !== "focus" ||
      d.timer.anchor !== null)
  )
    throw new Error("Invalid saved completion window. Your data has not been replaced.");
  if (d.timer.session) {
    const session = d.timer.session;
    if (
      typeof session.id !== "string" ||
      !Number.isFinite(session.startedAt) ||
      !Number.isFinite(session.targetMs) ||
      session.targetMs <= 0 ||
      !Number.isFinite(session.focusMs) ||
      session.focusMs < 0 ||
      !Number.isFinite(session.breakMs) ||
      session.breakMs < 0
    )
      throw new Error("Invalid saved session. Your data has not been replaced.");
    for (const segment of session.segments)
      if (
        !segment ||
        !["focus", "break"].includes(segment.kind) ||
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.end < segment.start ||
        (segment.taskId !== undefined &&
          segment.taskId !== null &&
          typeof segment.taskId !== "string")
      )
        throw new Error(
          "Invalid saved focus intervals. Your data has not been replaced.",
        );
    if (
      session.taskId !== undefined &&
      session.taskId !== null &&
      typeof session.taskId !== "string"
    )
      throw new Error("Invalid saved task assignment. Your data has not been replaced.");
    if (
      session.plannedMs !== undefined &&
      (!Number.isFinite(session.plannedMs) ||
        session.plannedMs <= 0 ||
        session.plannedMs > 720 * minute)
    )
      throw new Error(
        "Invalid planned session duration. Your data has not been replaced.",
      );
  }
  if (d.defaultsVersion !== 3) {
    if (
      (!d.defaultsVersion && d.settings.focus === 25) ||
      (d.defaultsVersion === 2 && d.settings.focus === 20)
    )
      d.settings.focus = 10;
    d.defaultsVersion = 3;
  }
  d.settings.showDuration ??= true;
  d.settings.showTask ??= true;
  d.settings.liquidEffect ??= true;
  // Previously paused focus sessions must no longer be resumable after upgrading.
  if (d.timer.mode === "focus" && d.timer.paused) d = reduce(d, { type: "pause" }, now);
  if (d.timer.mode === "breakDone") archive(d, now, "finished");
  if (d.timer.mode === "break" && d.timer.paused) {
    d.timer.paused = false;
    d.timer.anchor = now;
  }
  return d;
}
export type Action =
  | TaskAction
  | { type: "selectTask"; taskId: string | null; confirm?: boolean }
  | { type: "start" | "extend" | "break" | "extendBreak"; minutes: number }
  | {
      type:
        | "pause"
        | "resume"
        | "finish"
        | "skip"
        | "tick"
        | "completeTarget"
        | "reset"
        | "repeat"
        | "takeBreak";
    }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "import"; data: unknown };
export function reduce(
  input: Data,
  action: Action,
  now: number,
  id = "session-" + now,
): Data {
  const d = structuredClone(input),
    t = d.timer;
  if (
    action.type === "resume" ||
    action.type === "extendBreak" ||
    (action.type === "pause" && t.mode === "break")
  )
    throw new Error(
      "Breaks cannot be paused, resumed, or extended. End the break to start a new session.",
    );
  if (action.type === "reset") return defaults();
  if (action.type === "import") {
    const imported = validateData(action.data);
    if (t.mode !== "idle")
      throw new Error("End focus or end your break before importing data.");
    return imported;
  }
  if (action.type === "settings") {
    d.settings = validateSettings({ ...d.settings, ...action.settings });
    return d;
  }
  if (action.type === "deleteTask") {
    if (t.session && t.session.taskId === action.taskId) {
      const next = reduce(
        d,
        { type: "selectTask", taskId: null, confirm: true },
        now,
        id,
      );
      updateTasks(next, action, id);
      return next;
    }
    updateTasks(d, action, id);
    return d;
  }
  if (action.type === "saveTask" || action.type === "archiveTask") {
    updateTasks(d, action, id);
    return d;
  }
  if (action.type === "selectTask") {
    if (
      action.taskId !== null &&
      !d.tasks.some((task) => task.id === action.taskId && !task.archived)
    )
      throw new Error("Choose an active task or General.");
    if (t.session && (t.session.taskId ?? null) !== action.taskId) {
      if (action.confirm !== true)
        throw new Error(
          "Confirm Switch and continue to change the task for future focus time.",
        );
      if (t.mode === "focus" && !t.paused) settle(t, now);
      t.session.taskId = action.taskId;
    }
    d.selectedTaskId = action.taskId;
    return d;
  }
  if (action.type === "repeat") {
    if (t.mode !== "focus" || !t.session || remaining(t, now) > 0)
      throw new Error("Reach your focus target before repeating the session.");
    const taskId = t.session.taskId ?? null;
    if (taskId && !d.tasks.some((task) => task.id === taskId && !task.archived))
      throw new Error("Restore this task before repeating its session.");
    const planned = t.session.plannedMs ?? Math.min(t.session.targetMs, 720 * minute);
    archive(d, now, "finished");
    d.selectedTaskId = taskId;
    return reduce(d, { type: "start", minutes: planned / minute }, now, id);
  }
  if (action.type === "takeBreak") {
    if (t.mode !== "focus" || remaining(t, now) > 0)
      throw new Error("Reach your focus target before taking a break.");
    return reduce(d, { type: "break", minutes: d.settings.break }, now, id);
  }
  if (action.type === "start") {
    if (t.mode !== "idle") return d;
    d.timer = {
      ...emptyTimer(),
      mode: "focus",
      anchor: now,
      session: {
        id,
        startedAt: now,
        targetMs: duration(action.minutes),
        plannedMs: duration(action.minutes),
        focusMs: 0,
        breakMs: 0,
        segments: [],
        taskId: d.selectedTaskId,
      },
    };
    return d;
  }
  if (!t.session) return d;
  if (action.type === "completeTarget" && t.mode === "focus" && !t.paused) {
    if (t.completedAt === undefined && remaining(t, now) <= 0) {
      // Preserve intervals already saved by older versions that allowed overtime.
      const end = Math.max(
        now + remaining(t, now),
        t.session.segments.reduce(
          (latest, segment) => Math.max(latest, segment.end),
          t.session.startedAt,
        ),
      );
      settle(t, end);
      t.anchor = null;
      t.completedAt = end;
      t.notified = true;
    }
    if (t.completedAt !== undefined && now >= t.completedAt + focusActionWindow)
      archive(d, t.completedAt, "finished");
    return d;
  }
  if (action.type === "pause" && t.mode === "focus") {
    archive(d, now, "interrupted");
    return d;
  }
  if (action.type === "tick") {
    if (t.mode === "focus" && !t.paused && remaining(t, now) <= 0) t.notified = true;
    if (t.mode === "break" && !t.paused && remaining(t, now) <= 0) {
      const end = (t.anchor ?? now) + Math.max(0, t.breakTargetMs - t.breakElapsedMs);
      settle(t, end);
      archive(d, end, "finished");
    }
  }
  if (action.type === "extend" && t.mode === "focus") {
    const add = duration(action.minutes);
    t.session.targetMs = Math.max(t.session.targetMs, focusTime(t, now)) + add;
    t.notified = false;
    if (t.completedAt !== undefined) {
      delete t.completedAt;
      t.anchor = now;
    }
  }
  if (action.type === "break" && t.mode === "focus") {
    const ms = duration(action.minutes);
    settle(t, now);
    t.mode = "break";
    delete t.completedAt;
    t.paused = false;
    t.anchor = now;
    t.breakTargetMs = ms;
    t.breakElapsedMs = 0;
    t.notified = false;
  }
  if (action.type === "skip" && (t.mode === "break" || t.mode === "breakDone")) {
    if (t.mode === "break")
      settle(
        t,
        Math.min(
          now,
          (t.anchor ?? now) + Math.max(0, t.breakTargetMs - t.breakElapsedMs),
        ),
      );
    archive(d, now, "finished");
  }
  if (action.type === "finish") {
    archive(d, now, "finished");
  }
  return d;
}
export function validateSettings(raw: unknown): Settings {
  const s = raw as Settings;
  if (!s || typeof s !== "object") throw new Error("Invalid settings.");
  duration(s.focus);
  duration(s.break);
  if (
    typeof s.notifications !== "boolean" ||
    typeof s.sound !== "boolean" ||
    typeof s.blocking !== "boolean" ||
    (s.showDuration !== undefined && typeof s.showDuration !== "boolean") ||
    (s.showTask !== undefined && typeof s.showTask !== "boolean") ||
    (s.liquidEffect !== undefined && typeof s.liquidEffect !== "boolean") ||
    !["system", "light", "dark"].includes(s.theme) ||
    !Array.isArray(s.sites) ||
    s.sites.length > 100
  )
    throw new Error("Invalid settings.");
  return {
    focus: Number(s.focus),
    break: Number(s.break),
    notifications: s.notifications,
    sound: s.sound,
    blocking: s.blocking,
    theme: s.theme,
    showDuration: s.showDuration ?? true,
    showTask: s.showTask ?? true,
    liquidEffect: s.liquidEffect ?? true,
    sites: [...new Set(s.sites.map((v) => site(v)))],
  };
}
export function validateData(raw: unknown): Data {
  const d = raw as Data;
  if (
    !d ||
    ![1, 2].includes(d.version) ||
    !Array.isArray(d.history) ||
    d.history.length > 100000
  )
    throw new Error("This is not a supported Flow export.");
  if (d.version === 2 && (!Array.isArray(d.tasks) || !Array.isArray(d.goals)))
    throw new Error("Incomplete task data.");
  const ids = new Set<string>();
  const history = d.history.map((s) => {
    if (
      !s ||
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      !Number.isFinite(s.startedAt) ||
      !Number.isFinite(s.endedAt) ||
      s.endedAt! < s.startedAt ||
      !Array.isArray(s.segments)
    )
      throw new Error("Invalid session history.");
    ids.add(s.id);
    let last = s.startedAt;
    const segments = s.segments.map((p) => {
      if (
        !p ||
        !["focus", "break"].includes(p.kind) ||
        !Number.isFinite(p.start) ||
        !Number.isFinite(p.end) ||
        p.start < last ||
        p.end < p.start ||
        p.end > s.endedAt!
      )
        throw new Error("Invalid time records.");
      last = p.end;
      if (p.taskId !== undefined && p.taskId !== null && typeof p.taskId !== "string")
        throw new Error("Invalid task attribution.");
      return { start: p.start, end: p.end, kind: p.kind, taskId: p.taskId ?? null };
    });
    const sum = (kind: string) =>
      segments.filter((p) => p.kind === kind).reduce((n, p) => n + p.end - p.start, 0);
    if (!Number.isFinite(s.targetMs) || s.targetMs <= 0)
      throw new Error("Invalid target.");
    return {
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      outcome:
        s.outcome === "interrupted" ? ("interrupted" as const) : ("finished" as const),
      targetMs: s.targetMs,
      plannedMs:
        Number.isFinite(s.plannedMs) && s.plannedMs! > 0 && s.plannedMs! <= 720 * minute
          ? s.plannedMs
          : Math.min(s.targetMs, 720 * minute),
      focusMs: sum("focus"),
      breakMs: sum("break"),
      segments,
      taskId: typeof s.taskId === "string" ? s.taskId : null,
    };
  });
  const catalog = validateCatalog(d.tasks ?? [], d.goals ?? []);
  return {
    version: 2,
    defaultsVersion: 3,
    timer: emptyTimer(),
    settings: validateSettings(d.settings),
    history,
    ...catalog,
    selectedTaskId: catalog.tasks.some(
      (task) => task.id === d.selectedTaskId && !task.archived,
    )
      ? d.selectedTaskId
      : null,
  };
}
export function focusSegments(data: Data, now: number): Segment[] {
  const segments = data.history.flatMap((s) => s.segments);
  const t = data.timer;
  if (t.session) {
    segments.push(...t.session.segments);
    if (t.mode === "focus" && !t.paused && t.anchor !== null)
      segments.push({
        start: t.anchor,
        end: Math.max(t.anchor, now),
        kind: "focus",
        taskId: t.session.taskId ?? null,
      });
  }
  return segments.filter((segment) => segment.kind === "focus");
}
export function daily(data: Data, now: number, days = 7) {
  const segments = focusSegments(data, now);
  return Array.from({ length: days }, (_, i) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1 + i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      date: start,
      ms: segments
        .filter((s) => s.kind === "focus")
        .reduce(
          (n, s) => n + Math.max(0, Math.min(s.end, +end) - Math.max(s.start, +start)),
          0,
        ),
    };
  });
}
