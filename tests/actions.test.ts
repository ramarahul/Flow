import { it } from "node:test";
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaults, reduce, type Data } from "../src/domain.js";
import { SessionActions } from "../src/SessionActions.js";
import { StatsView } from "../src/StatsView.js";
import { TimerReadout } from "../src/TimerReadout.js";
import { TaskPicker, TaskViews } from "../src/TaskViews.js";

const render = (data: Data, now: number) =>
  renderToStaticMarkup(
    createElement(SessionActions, {
      data,
      now,
      busy: false,
      send: async () => undefined,
    }),
  );
it("keeps countdown actions hidden and presents only the essential choices in overtime", () => {
  const data = reduce(defaults(), { type: "start", minutes: 1 }, 1000);
  assert.equal(render(data, 2000), "");
  const overtime = render(data, 62000);
  assert.doesNotMatch(overtime, /Keep going|Finish session/);
  assert.match(overtime, /Take a break/);
  assert.match(overtime, /End focus/);
  assert.match(overtime, /Saves your focus time and returns home/);
  const primaryActions = overtime.split("<details")[0];
  assert.equal((primaryActions.match(/<button/g) || []).length, 2);
  assert.match(overtime, /<details[^>]*class="session-options"/);
  assert.doesNotMatch(overtime, /<details[^>]* open/);
  assert.doesNotMatch(overtime, /<select|<input/);
});
it("switches from countdown to total focus time counting upward at the target", () => {
  const data = reduce(defaults(), { type: "start", minutes: 10 }, 1000);
  const read = (now: number) =>
    renderToStaticMarkup(createElement(TimerReadout, { timer: data.timer, now }));
  assert.match(read(1000 + 9 * 60000), /IN FLOW/);
  assert.match(read(1000 + 9 * 60000), /01:00/);
  const reached = read(1000 + 10 * 60000);
  assert.match(reached, /FOCUS COMPLETE/);
  assert.match(reached, /10:00/);
  const later = read(1000 + 12 * 60000 + 34000);
  assert.match(later, /12:34/);
  assert.match(later, /Your focus keeps counting automatically/);
  assert.match(later, /02:34 beyond your 10 min target/);
  assert.doesNotMatch(later, /\+02:34/);
  assert.equal(data.history.length, 0);
});
it("keeps the countdown compact without adding panels or controls", () => {
  const data = reduce(defaults(), { type: "start", minutes: 10 }, 1000);
  const html = renderToStaticMarkup(
    createElement(TimerReadout, { timer: data.timer, now: 1000 + 150000 }),
  );
  assert.match(html, /IN FLOW/);
  assert.match(html, /07:30/);
  assert.match(html, /02:30/);
  assert.doesNotMatch(html, /focus-countdown|focus-dial|<svg/);
  assert.doesNotMatch(html, /<button|<input|<select|Pause|Extend|Finish/);
  const long = reduce(defaults(), { type: "start", minutes: 180 }, 1000);
  assert.match(
    renderToStaticMarkup(createElement(TimerReadout, { timer: long.timer, now: 1000 })),
    /180:00/,
  );
});
it("shows only End break, then returns to an empty home action area", () => {
  let data = reduce(defaults(), { type: "start", minutes: 1 }, 1000);
  data = reduce(data, { type: "break", minutes: 5 }, 62000);
  const activeBreak = render(data, 63000);
  assert.match(activeBreak, /End break/);
  assert.equal((activeBreak.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(activeBreak, /Pause|Resume|Add time|<select|<input/);
  data = reduce(data, { type: "skip" }, 64000);
  assert.equal(render(data, 64000), "");
});
it("shows factual statistics with session history collapsed by default", () => {
  const now = +new Date(2026, 10, 9, 12);
  let data = reduce(
    defaults(),
    { type: "start", minutes: 1 },
    now - 10 * 60000,
    "finished",
  );
  data = reduce(data, { type: "finish" }, now - 9 * 60000);
  data = reduce(data, { type: "start", minutes: 10 }, now - 5 * 60000, "partial");
  data = reduce(data, { type: "pause" }, now - 5 * 60000 + 30000);
  const html = renderToStaticMarkup(createElement(StatsView, { data, now }));
  assert.doesNotMatch(html, /Back to timer|back-home/);
  assert.match(html, /Focused today/);
  assert.match(html, /This week/);
  assert.match(html, /All-time sessions<\/span><strong>1<\/strong>/);
  assert.match(html, /<details class="session-history-card"><summary/);
  assert.match(html, /All sessions/);
  assert.doesNotMatch(html, /session-row|Show 5 more/);
});
it("renders quiet daily goal completion with uncapped actual time and a capped indicator", () => {
  const now = +new Date(2026, 10, 9, 12);
  let data = reduce(
    defaults(),
    {
      type: "saveTask",
      name: "Reading",
      goal: { targetMinutes: 120, weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true },
    },
    now,
    "reading",
  );
  data = reduce(data, { type: "selectTask", taskId: "reading" }, now);
  data = reduce(data, { type: "start", minutes: 25 }, now);
  const html = renderToStaticMarkup(
    createElement(TaskPicker, { data, now: now + 145 * 60000, onOpen: () => {} }),
  );
  assert.match(html, /2h 25m today \/ 2h/);
  assert.match(html, /Daily goal reached/);
  assert.match(html, /aria-valuenow="100"/);
  assert.equal(data.timer.mode, "focus");
  assert.equal(data.history.length, 0);
});
it("provides General and task-management access in a separate selection screen", () => {
  const data = reduce(
    defaults(),
    {
      type: "saveTask",
      name: "Reading",
      goal: { targetMinutes: 30, weekdays: [1, 2, 3, 4, 5], enabled: true },
    },
    1000,
    "reading",
  );
  const html = renderToStaticMarkup(
    createElement(TaskViews, {
      data,
      now: +new Date(2026, 10, 7, 12),
      send: async () => undefined,
      onBack: () => {},
    }),
  );
  assert.match(html, /General/);
  assert.match(html, /Reading/);
  assert.match(html, /Add task/);
  assert.match(html, /Edit task: Reading/);
  assert.doesNotMatch(html, /task-management|task-filters/);
  assert.doesNotMatch(html, />Delete</);
  assert.doesNotMatch(html, /Manage tasks/);
  assert.match(html, /Not scheduled today/);
  assert(html.indexOf("Add task") < html.indexOf("default-task"));
});

it("shows the selected task even when its goal is disabled in the tasks view", () => {
  const data = reduce(
    defaults(),
    {
      type: "saveTask",
      name: "Reading",
      goal: { targetMinutes: 30, weekdays: [1, 2, 3, 4, 5], enabled: false },
    },
    1000,
    "reading",
  );
  data.selectedTaskId = "reading";
  const html = renderToStaticMarkup(
    createElement(TaskViews, {
      data,
      now: 1000,
      send: async () => undefined,
      onBack: () => {},
    }),
  );
  assert.match(html, /aria-pressed="true"[^>]*>[\s\S]*?Reading/);
  assert.match(html, /General/);
  assert(html.indexOf("Add task") < html.indexOf("default-task"));
});
