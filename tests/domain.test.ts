import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  defaults,
  reduce,
  remaining,
  focusTime,
  minute,
  daily,
  validateData,
  site,
  migrate,
  focusPresets,
  validateSettings,
} from "../src/domain.js";
const start = (now = 1000) =>
  reduce(defaults(), { type: "start", minutes: 25 }, now, "same");
describe("continuous focus sessions", () => {
  it("persists task visibility, defaults older data to visible, and rejects invalid values", () => {
    assert.equal(defaults().settings.showTask, true);
    const data = reduce(
      defaults(),
      { type: "settings", settings: { showTask: false } },
      1000,
    );
    assert.equal(migrate(data, 2000).settings.showTask, false);
    assert.equal(validateData(JSON.parse(JSON.stringify(data))).settings.showTask, false);
    const legacy = structuredClone(data);
    Reflect.deleteProperty(legacy.settings, "showTask");
    assert.equal(migrate(legacy, 2000).settings.showTask, true);
    assert.equal(validateData(legacy).settings.showTask, true);
    assert.throws(
      () => validateSettings({ ...defaults().settings, showTask: "false" }),
      /Invalid settings/,
    );
  });
  it("restores a stopped completion window and saves once without adding focused time", () => {
    const end = 1000 + 25 * minute;
    let d = reduce(start(), { type: "completeTarget" }, end + 5000);
    assert.equal(d.timer.session!.focusMs, 25 * minute);
    assert.equal(d.timer.anchor, null);
    d = migrate(d, end + 15000);
    assert.equal(focusTime(d.timer, end + 20000), 25 * minute);
    d = reduce(d, { type: "completeTarget" }, end + 30000);
    d = reduce(d, { type: "completeTarget" }, end + 60000);
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history.length, 1);
    assert.equal(d.history[0].endedAt, end);
    validateData(d);
  });
  it("preserves previously saved legacy overtime intervals when completing after upgrade", () => {
    let d = start();
    d.timer.session!.focusMs = 28 * minute;
    d.timer.session!.segments = [{ start: 1000, end: 1000 + 28 * minute, kind: "focus" }];
    d.timer.anchor = 1000 + 28 * minute;
    d = reduce(d, { type: "completeTarget" }, 1000 + 30 * minute);
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history[0].focusMs, 28 * minute);
    validateData(d);
  });
  it("ends focus on pause and logs only accumulated focus time", () => {
    let d = reduce(start(), { type: "pause" }, 1000 + 5 * minute);
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.timer.session, null);
    assert.equal(d.history[0].focusMs, 5 * minute);
    assert.equal(d.history[0].outcome, "interrupted");
    assert.throws(() => reduce(d, { type: "resume" }, 1000 + 20 * minute));
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history[0].focusMs, 5 * minute);
  });
  it("extends countdown while preserving identity and accumulation", () => {
    const d = reduce(start(), { type: "extend", minutes: 5 }, 1000 + 10 * minute);
    assert.equal(remaining(d.timer, 1000 + 10 * minute), 20 * minute);
    assert.equal(d.timer.session?.id, "same");
    assert.equal(focusTime(d.timer, 1000 + 10 * minute), 10 * minute);
  });
  it("extends overtime with a full new countdown and no completion", () => {
    let d = reduce(start(), { type: "tick" }, 1000 + 28 * minute);
    assert.equal(d.timer.notified, true);
    assert.equal(d.history.length, 0);
    d = reduce(d, { type: "extend", minutes: 5 }, 1000 + 28 * minute);
    assert.equal(remaining(d.timer, 1000 + 28 * minute), 5 * minute);
    assert.equal(d.timer.notified, false);
    assert.equal(focusTime(d.timer, 1000 + 28 * minute), 28 * minute);
  });
  it("logs overtime when focus is interrupted without keeping a resumable timer", () => {
    const d = reduce(start(), { type: "pause" }, 1000 + 28 * minute);
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history[0].focusMs, 28 * minute);
  });
  it("finishes a break after sleep with exact focus and break time", () => {
    let d = reduce(start(), { type: "break", minutes: 5 }, 1000 + 10 * minute);
    d = reduce(d, { type: "tick" }, 1000 + 30 * minute);
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history[0].breakMs, 5 * minute);
    assert.equal(d.history[0].focusMs, 10 * minute);
    assert.equal(d.history[0].endedAt, 1000 + 15 * minute);
    d = reduce(d, { type: "tick" }, 1000 + 40 * minute);
    assert.equal(d.history.length, 1);
  });
  it("rejects break pause/extension and saves actual time when ended early", () => {
    let d = reduce(start(), { type: "break", minutes: 5 }, 1000 + minute);
    assert.throws(() => reduce(d, { type: "pause" }, 1000 + 2 * minute));
    assert.throws(() =>
      reduce(d, { type: "extendBreak", minutes: 5 }, 1000 + 2 * minute),
    );
    assert.throws(() => reduce(d, { type: "resume" }, 1000 + 2 * minute));
    d = reduce(d, { type: "skip" }, 1000 + 2 * minute);
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history[0].breakMs, minute);
    d = reduce(d, { type: "skip" }, 1000 + 3 * minute);
    assert.equal(d.history.length, 1);
    d = reduce(d, { type: "start", minutes: 20 }, 1000 + 3 * minute, "fresh");
    assert.equal(d.timer.session!.id, "fresh");
    assert.equal(focusTime(d.timer, 1000 + 3 * minute), 0);
  });
  it("recovers persisted timestamps after popup closure and restart", () => {
    const stored = JSON.parse(JSON.stringify(start()));
    const d = reduce(stored, { type: "tick" }, 1000 + 60 * minute);
    assert.equal(remaining(d.timer, 1000 + 60 * minute), -35 * minute);
    assert.equal(focusTime(d.timer, 1000 + 60 * minute), 60 * minute);
    assert.equal(reduce(d, { type: "tick" }, 1000 + 61 * minute).timer.notified, true);
  });
  it("finishes once despite repeated finish commands", () => {
    let d = reduce(start(), { type: "finish" }, 1000 + minute);
    d = reduce(d, { type: "finish" }, 1000 + 2 * minute);
    assert.equal(d.history.length, 1);
    assert.equal(d.history[0].focusMs, minute);
  });
  it("ignores repeated starts, pauses and resumes", () => {
    let d = reduce(start(), { type: "start", minutes: 60 }, 2000);
    d = reduce(d, { type: "pause" }, 3000);
    d = reduce(d, { type: "pause" }, 4000);
    assert.throws(() => reduce(d, { type: "resume" }, 5000));
    assert.throws(() => reduce(d, { type: "resume" }, 6000));
    assert.equal(d.timer.mode, "idle");
    assert.equal(d.history.length, 1);
    assert.equal(d.history[0].id, "same");
    assert.equal(d.history[0].focusMs, 2000);
  });
  it("splits time at local midnight and excludes breaks", () => {
    const begin = +new Date(2026, 10, 8, 23, 50);
    let d = reduce(defaults(), { type: "start", minutes: 25 }, begin);
    d = reduce(d, { type: "break", minutes: 5 }, begin + 20 * minute);
    d = reduce(d, { type: "tick" }, begin + 25 * minute);
    d = reduce(d, { type: "finish" }, begin + 30 * minute);
    assert.deepEqual(
      daily(d, begin + 30 * minute, 2).map((x) => x.ms),
      [10 * minute, 10 * minute],
    );
  });
  it("validates durations/imports and whitelists model fields", () => {
    assert.throws(() => reduce(defaults(), { type: "start", minutes: NaN }, 0));
    assert.throws(() => validateData({ version: 2 }));
    const d = validateData({ ...defaults(), obsoleteDecoration: 99 });
    assert.deepEqual(Object.keys(d), [
      "version",
      "defaultsVersion",
      "timer",
      "settings",
      "history",
      "tasks",
      "goals",
      "selectedTaskId",
    ]);
  });
  it("normalizes domains and rejects unsupported addresses", () => {
    assert.equal(site("https://www.youtube.com/watch"), "youtube.com");
    assert.throws(() => site("chrome://settings"));
  });
  it("uses ten minutes by default and migrates the previous default only once", () => {
    assert.equal(defaults().settings.focus, 10);
    assert.deepEqual(focusPresets, [10, 20, 30, 60, 90, 180]);
    const oldDefault = defaults();
    oldDefault.defaultsVersion = 2;
    oldDefault.settings.focus = 20;
    assert.equal(migrate(oldDefault, 1000).settings.focus, 10);
    const legacy = defaults();
    delete legacy.defaultsVersion;
    legacy.settings.focus = 25;
    const updated = migrate(legacy, 1000);
    assert.equal(updated.settings.focus, 10);
    updated.settings.focus = 25;
    assert.equal(migrate(updated, 2000).settings.focus, 25);
    delete legacy.defaultsVersion;
    legacy.settings.focus = 45;
    assert.equal(migrate(legacy, 2000).settings.focus, 45);
  });
  it("shows the home duration selector by default and preserves the hidden preference", () => {
    assert.equal(defaults().settings.showDuration, true);
    const data = reduce(
      defaults(),
      { type: "settings", settings: { showDuration: false } },
      1000,
    );
    assert.equal(data.settings.showDuration, false);
    assert.equal(
      validateData(JSON.parse(JSON.stringify(data))).settings.showDuration,
      false,
    );
    assert.equal(migrate(data, 2000).settings.showDuration, false);
    const legacy = defaults();
    Reflect.deleteProperty(legacy.settings, "showDuration");
    assert.equal(migrate(legacy, 2000).settings.showDuration, true);
    assert.equal(validateData(legacy).settings.showDuration, true);
    assert.throws(() =>
      validateSettings({ ...defaults().settings, showDuration: "false" }),
    );
  });
  it("preserves interrupted time and outcome through export and import", () => {
    const interrupted = reduce(start(), { type: "pause" }, 1000 + 123456);
    const imported = validateData(JSON.parse(JSON.stringify(interrupted)));
    assert.equal(imported.history[0].focusMs, 123456);
    assert.equal(imported.history[0].outcome, "interrupted");
    assert.equal(imported.timer.mode, "idle");
  });
  it("archives a legacy paused session without counting time since pause", () => {
    const legacy = start();
    legacy.timer.paused = true;
    legacy.timer.anchor = null;
    legacy.timer.session!.focusMs = 2 * minute;
    legacy.timer.session!.segments = [
      { start: 1000, end: 1000 + 2 * minute, kind: "focus" },
    ];
    const updated = migrate(legacy, 1000 + 60 * minute);
    assert.equal(updated.timer.mode, "idle");
    assert.equal(updated.history[0].focusMs, 2 * minute);
    assert.equal(updated.history[0].outcome, "interrupted");
    assert.equal(migrate(updated, 1000 + 80 * minute).history.length, 1);
  });
  it("archives a completed legacy break to home only once", () => {
    const legacy = reduce(start(), { type: "break", minutes: 5 }, 1000 + 25 * minute);
    legacy.timer.mode = "breakDone";
    legacy.timer.anchor = null;
    legacy.timer.session!.breakMs = 5 * minute;
    const recovered = migrate(legacy, 1000 + 35 * minute);
    assert.equal(recovered.timer.mode, "idle");
    assert.equal(recovered.history.length, 1);
    assert.equal(migrate(recovered, 1000 + 40 * minute).history.length, 1);
  });
});
