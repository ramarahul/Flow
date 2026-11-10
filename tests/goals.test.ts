import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  defaults,
  reduce,
  migrate,
  validateData,
  minute,
  remaining,
  type Data,
} from "../src/domain.js";
import { taskTotals, taskProgress, dayWindow, taskLabel } from "../src/goals.js";

const base = +new Date(2026, 10, 9, 12);
const all = [0, 1, 2, 3, 4, 5, 6];
function tasks() {
  let data = reduce(
    defaults(),
    {
      type: "saveTask",
      name: "Reading",
      goal: { targetMinutes: 120, weekdays: all, enabled: true },
    },
    base,
    "reading",
  );
  return reduce(
    data,
    {
      type: "saveTask",
      name: "Coding",
      goal: { targetMinutes: 60, weekdays: all, enabled: true },
    },
    base,
    "coding",
  );
}
const select = (data: Data, id: string | null, at = base, confirm = false) =>
  reduce(data, { type: "selectTask", taskId: id, confirm }, at);
const work = (data: Data, id: string | null, start: number, minutes: number) =>
  reduce(
    reduce(
      select(data, id, start),
      { type: "start", minutes: 25 },
      start,
      `session-${start}`,
    ),
    { type: "finish" },
    start + minutes * minute,
  );

describe("recurring task goals and durable interval attribution", () => {
  it("deletes a task and goal while preserving historical time and import compatibility", () => {
    let data = work(tasks(), "reading", base, 2);
    const history = structuredClone(data.history);
    data = reduce(data, { type: "deleteTask", taskId: "reading" }, base + 3 * minute);
    assert.equal(
      data.tasks.some((task) => task.id === "reading"),
      false,
    );
    assert.equal(
      data.goals.some((goal) => goal.taskId === "reading"),
      false,
    );
    assert.equal(data.selectedTaskId, null);
    assert.deepEqual(data.history, history);
    assert.equal(taskLabel(data, "reading"), "Deleted task");
    assert.equal(taskTotals(data, base + 3 * minute).get("reading"), 2 * minute);
    assert.deepEqual(validateData(data).history, history);
    assert.deepEqual(migrate(data, base + 3 * minute).history, history);
  });
  it("keeps Quick Focus available when every custom task has been deleted", () => {
    let data = tasks();
    data = reduce(data, { type: "archiveTask", taskId: "reading", archived: true }, base);
    for (const taskId of ["reading", "coding"])
      data = reduce(data, { type: "deleteTask", taskId }, base);
    assert.deepEqual(data.tasks, []);
    assert.deepEqual(data.goals, []);
    assert.equal(taskLabel(data, data.selectedTaskId), "Quick Focus");
    assert.throws(
      () => reduce(data, { type: "deleteTask", taskId: null as unknown as string }, base),
      /permanent default/,
    );
    assert.throws(
      () => reduce(data, { type: "deleteTask", taskId: "missing" }, base),
      /Task not found/,
    );
    data = reduce(data, { type: "start", minutes: 10 }, base);
    assert.equal(data.timer.session!.taskId, null);
  });
  it("switches future time to Quick Focus when deleting the running task without restarting", () => {
    let data = reduce(
      select(tasks(), "reading"),
      { type: "start", minutes: 10 },
      base,
      "running",
    );
    data = reduce(data, { type: "deleteTask", taskId: "reading" }, base + 2 * minute);
    assert.equal(data.timer.session!.id, "running");
    assert.equal(data.timer.session!.taskId, null);
    assert.equal(remaining(data.timer, base + 2 * minute), 8 * minute);
    assert.equal(data.timer.session!.segments[0].taskId, "reading");
    data = reduce(data, { type: "finish" }, base + 4 * minute);
    assert.equal(taskTotals(data, base + 4 * minute).get("reading"), 2 * minute);
    assert.equal(taskTotals(data, base + 4 * minute).get(null), 2 * minute);
    assert.equal(data.history[0].focusMs, 4 * minute);
    validateData(data);
  });
  it("repeats a task session without losing goal time and uses the initial duration after extensions", () => {
    let d = reduce(
      select(tasks(), "reading"),
      { type: "start", minutes: 10 },
      base,
      "old",
    );
    d = reduce(d, { type: "extend", minutes: 5 }, base + 11 * minute);
    d = reduce(d, { type: "repeat" }, base + 20 * minute, "new");
    assert.equal(d.timer.session!.id, "new");
    assert.equal(d.timer.session!.taskId, "reading");
    assert.equal(d.timer.session!.targetMs, 10 * minute);
    assert.equal(d.history[0].focusMs, 20 * minute);
    assert.equal(taskTotals(d, base + 25 * minute).get("reading"), 25 * minute);
    assert.equal(d.history.length, 1);
  });
  it("adds two sessions to one daily task goal", () => {
    let d = work(tasks(), "reading", base, 40);
    d = work(d, "reading", base + 50 * minute, 50);
    assert.equal(taskTotals(d, base + 100 * minute).get("reading"), 90 * minute);
    assert.equal(taskProgress(d, "reading", base + 100 * minute).target, 120 * minute);
  });
  it("keeps separate tasks and Quick Focus independent", () => {
    let d = work(tasks(), "reading", base, 40);
    d = work(d, "coding", base + 50 * minute, 20);
    d = work(d, null, base + 80 * minute, 10);
    const totals = taskTotals(d, base + 100 * minute);
    assert.equal(totals.get("reading"), 40 * minute);
    assert.equal(totals.get("coding"), 20 * minute);
    assert.equal(totals.get(null), 10 * minute);
  });
  it("excludes breaks and time after explicit finish", () => {
    let d = reduce(select(tasks(), "reading"), { type: "start", minutes: 10 }, base);
    d = reduce(d, { type: "break", minutes: 5 }, base + 10 * minute);
    d = reduce(d, { type: "tick" }, base + 30 * minute);
    assert.equal(taskTotals(d, base + 90 * minute).get("reading"), 10 * minute);
    assert.equal(d.history[0].breakMs, 5 * minute);
    assert.equal(d.timer.mode, "idle");
  });
  it("retains overtime and extension progress independently of the daily goal", () => {
    let d = reduce(
      select(tasks(), "reading"),
      { type: "start", minutes: 25 },
      base,
      "same",
    );
    d = reduce(d, { type: "tick" }, base + 40 * minute);
    assert.equal(taskTotals(d, base + 40 * minute).get("reading"), 40 * minute);
    d = reduce(d, { type: "extend", minutes: 15 }, base + 40 * minute);
    assert.equal(remaining(d.timer, base + 40 * minute), 15 * minute);
    assert.equal(d.timer.session!.id, "same");
    assert.equal(taskProgress(d, "reading", base + 45 * minute).ms, 45 * minute);
  });
  it("switches only future intervals while preserving session and remaining time", () => {
    let d = reduce(
      select(tasks(), "reading"),
      { type: "start", minutes: 90 },
      base,
      "same",
    );
    const before = remaining(d.timer, base + 40 * minute);
    const snapshot = JSON.stringify(d);
    assert.throws(() => select(d, "coding", base + 40 * minute));
    assert.equal(JSON.stringify(d), snapshot);
    d = select(d, "coding", base + 40 * minute, true);
    assert.equal(remaining(d.timer, base + 40 * minute), before);
    assert.equal(d.timer.session!.id, "same");
    d = select(d, "reading", base + 50 * minute, true);
    d = reduce(d, { type: "finish" }, base + 70 * minute);
    assert.equal(taskTotals(d, base + 80 * minute).get("reading"), 60 * minute);
    assert.equal(taskTotals(d, base + 80 * minute).get("coding"), 10 * minute);
  });
  it("switches during breaks without moving recorded focus or restarting the break", () => {
    let d = reduce(select(tasks(), "reading"), { type: "start", minutes: 10 }, base);
    d = reduce(d, { type: "break", minutes: 5 }, base + 10 * minute);
    d = select(d, "coding", base + 12 * minute, true);
    assert.equal(remaining(d.timer, base + 12 * minute), 3 * minute);
    d = reduce(d, { type: "skip" }, base + 13 * minute);
    assert.equal(taskTotals(d, base + 14 * minute).get("reading"), 10 * minute);
    assert.equal(taskTotals(d, base + 14 * minute).get("coding"), undefined);
    assert.equal(d.selectedTaskId, "coding");
    d = reduce(d, { type: "start", minutes: 10 }, base + 15 * minute);
    assert.equal(taskTotals(d, base + 17 * minute).get("coding"), 2 * minute);
  });
  it("does not accumulate paused legacy time during a task switch", () => {
    let d = reduce(select(tasks(), "reading"), { type: "start", minutes: 25 }, base);
    d.timer.session!.focusMs = 10 * minute;
    d.timer.session!.segments = [
      { start: base, end: base + 10 * minute, kind: "focus", taskId: "reading" },
    ];
    d.timer.paused = true;
    d.timer.anchor = null;
    d = select(d, "coding", base + 20 * minute, true);
    assert.equal(d.timer.paused, true);
    assert.equal(taskTotals(d, base + 30 * minute).get("reading"), 10 * minute);
    assert.equal(taskTotals(d, base + 30 * minute).get("coding"), undefined);
  });
  it("splits focus at local midnight without incrementing a counter", () => {
    const start = +new Date(2026, 10, 9, 23, 40);
    const d = work(tasks(), "reading", start, 60);
    const now = +new Date(2026, 10, 10, 12);
    assert.equal(taskTotals(d, now).get("reading"), 40 * minute);
    assert.equal(taskTotals(d, now, 1, -1).get("reading"), 20 * minute);
    assert.equal(taskTotals(d, now, 7).get("reading"), 60 * minute);
  });
  it("uses local calendar boundaries for both daylight-saving changes", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      for (const [month, day, hours] of [
        [2, 8, 23],
        [10, 1, 25],
      ]) {
        const now = +new Date(2026, month, day, 12);
        const window = dayWindow(now);
        assert.equal(window.end - window.start, hours * 60 * minute);
        const d = work(tasks(), "reading", window.start, hours * 60);
        assert.equal(taskTotals(d, now).get("reading"), hours * 60 * minute);
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
  it("restores an active session repeatedly without double-counting", () => {
    let d = reduce(select(tasks(), "reading"), { type: "start", minutes: 25 }, base);
    d = select(d, "coding", base + 10 * minute, true);
    for (let i = 0; i < 5; i++) {
      d = migrate(JSON.parse(JSON.stringify(d)), base + 20 * minute);
      d = reduce(d, { type: "tick" }, base + 20 * minute);
    }
    const totals = taskTotals(d, base + 20 * minute);
    assert.equal(totals.get("reading"), 10 * minute);
    assert.equal(totals.get("coding"), 10 * minute);
    assert.equal(d.history.length, 0);
  });
  it("completes goals quietly without completing the timer and retains excess time", () => {
    let d = reduce(
      tasks(),
      {
        type: "saveTask",
        taskId: "reading",
        name: "Reading",
        goal: { targetMinutes: 10, weekdays: all, enabled: true },
      },
      base,
    );
    d = reduce(select(d, "reading"), { type: "start", minutes: 60 }, base);
    d = reduce(d, { type: "tick" }, base + 20 * minute);
    const progress = taskProgress(d, "reading", base + 20 * minute);
    assert.equal(progress.complete, true);
    assert.equal(progress.ms, 20 * minute);
    assert.equal(progress.percent, 100);
    assert.equal(d.timer.mode, "focus");
    assert.equal(d.history.length, 0);
    assert.equal(remaining(d.timer, base + 20 * minute), 40 * minute);
  });
  it("marks excluded weekdays unscheduled but records voluntary focus", () => {
    let d = reduce(
      tasks(),
      {
        type: "saveTask",
        taskId: "reading",
        name: "Reading",
        goal: { targetMinutes: 30, weekdays: [1, 2, 3, 4, 5], enabled: true },
      },
      base,
    );
    const saturday = +new Date(2026, 10, 7, 12);
    d = work(d, "reading", saturday, 40);
    const progress = taskProgress(d, "reading", saturday + 45 * minute);
    assert.equal(progress.scheduled, false);
    assert.equal(progress.complete, false);
    assert.equal(progress.ms, 40 * minute);
  });
  it("preserves history through rename, archive/restore, and goal edits", () => {
    let d = work(tasks(), "reading", base, 40);
    d = reduce(
      d,
      {
        type: "saveTask",
        taskId: "reading",
        name: "Books",
        goal: { targetMinutes: 30, weekdays: [1, 2, 3], enabled: false },
      },
      base + 50 * minute,
    );
    d = reduce(
      d,
      { type: "archiveTask", taskId: "reading", archived: true },
      base + 50 * minute,
    );
    assert.equal(taskLabel(d, "reading"), "Books (archived)");
    assert.equal(taskTotals(d, base + 60 * minute).get("reading"), 40 * minute);
    assert.equal(taskProgress(d, "reading", base + 60 * minute).goal, undefined);
    assert.throws(() => select(d, "reading"));
    d = reduce(
      d,
      { type: "archiveTask", taskId: "reading", archived: false },
      base + 60 * minute,
    );
    assert.equal(select(d, "reading").selectedTaskId, "reading");
  });
  it("migrates old history and an active timer to Quick Focus without losing data", () => {
    let old = work(defaults(), null, base, 10);
    old = reduce(old, { type: "start", minutes: 25 }, base + 20 * minute, "active");
    const legacy = { ...old, version: 1 };
    for (const key of ["tasks", "goals", "selectedTaskId"])
      Reflect.deleteProperty(legacy, key);
    const snapshot = JSON.stringify(legacy);
    const d = migrate(legacy, base + 30 * minute);
    assert.equal(d.version, 2);
    assert.equal(d.history.length, 1);
    assert.equal(d.timer.session!.id, "active");
    assert.equal(d.settings.focus, old.settings.focus);
    assert.equal(taskTotals(d, base + 30 * minute).get(null), 20 * minute);
    assert.equal(JSON.stringify(legacy), snapshot);
    assert.throws(() => migrate({ ...d, tasks: "invalid" }, base));
  });
  it("validates duplicates, schedules, and import/export attribution", () => {
    const d = work(tasks(), "reading", base, 40);
    assert.throws(() =>
      reduce(
        d,
        {
          type: "saveTask",
          name: " reading ",
          goal: { targetMinutes: 30, weekdays: all, enabled: true },
        },
        base,
      ),
    );
    assert.throws(() =>
      reduce(
        d,
        {
          type: "saveTask",
          name: "Bad",
          goal: { targetMinutes: 30, weekdays: [], enabled: true },
        },
        base,
      ),
    );
    const imported = validateData(JSON.parse(JSON.stringify(d)));
    assert.equal(imported.tasks.length, 2);
    assert.equal(taskTotals(imported, base + 50 * minute).get("reading"), 40 * minute);
    assert.equal(imported.selectedTaskId, "reading");
  });
});
