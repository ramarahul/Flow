import { it } from "node:test";
import assert from "node:assert/strict";
import { defaults, reduce, minute, type Segment } from "../src/domain.js";
import { calendarPeriod, periodStatistics } from "../src/statistics.js";

function records(segments: Segment[]) {
  const data = defaults();
  data.history = segments.map((segment, index) => ({
    id: `record-${index}`,
    startedAt: segment.start,
    endedAt: segment.end,
    targetMs: segment.end - segment.start,
    focusMs: segment.kind === "focus" ? segment.end - segment.start : 0,
    breakMs: segment.kind === "break" ? segment.end - segment.start : 0,
    segments: [segment],
  }));
  return data;
}

it("uses Monday calendar weeks and navigates month/year boundaries without date overflow", () => {
  const now = +new Date(2027, 0, 1, 12);
  const week = calendarPeriod(now, "week");
  assert.equal(week.start, +new Date(2026, 11, 28));
  assert.equal(week.end, +new Date(2027, 0, 4));
  const previousMonth = calendarPeriod(+new Date(2024, 2, 31), "month", -1);
  assert.equal(previousMonth.start, +new Date(2024, 1, 1));
  assert.equal(previousMonth.end, +new Date(2024, 2, 1));
  const previousYear = calendarPeriod(+new Date(2024, 1, 29), "year", -1);
  assert.equal(previousYear.start, +new Date(2023, 0, 1));
  assert.equal(previousYear.end, +new Date(2024, 0, 1));
});

it("uses real month lengths, leap days, and twelve monthly buckets for years", () => {
  for (const [year, month, count] of [
    [2024, 1, 29],
    [2025, 1, 28],
    [2026, 3, 30],
    [2026, 0, 31],
  ]) {
    const result = periodStatistics(defaults(), +new Date(year, month, 15), "month");
    assert.equal(result.buckets.length, count);
  }
  assert.equal(
    periodStatistics(defaults(), +new Date(2026, 10, 10), "year").buckets.length,
    12,
  );
});

it("splits daily focus by hour, excludes breaks and navigates across midnight", () => {
  const now = +new Date(2026, 0, 1, 12);
  const result = periodStatistics(
    records([
      {
        start: +new Date(2026, 0, 1, 0, 45),
        end: +new Date(2026, 0, 1, 1, 15),
        kind: "focus",
        taskId: "reading",
      },
      {
        start: +new Date(2026, 0, 1, 1, 15),
        end: +new Date(2026, 0, 1, 1, 30),
        kind: "break",
      },
    ]),
    now,
    "day",
  );
  assert.equal(result.buckets.length, 24);
  assert.equal(result.buckets[0].ms, 15 * minute);
  assert.equal(result.buckets[1].ms, 15 * minute);
  assert.equal(result.total, 30 * minute);
  assert.equal(result.taskTotals.get("reading"), result.total);
  assert(result.buckets.slice(13).every((bucket) => bucket.upcoming && bucket.ms === 0));
  assert.equal(calendarPeriod(now, "day", -1).start, +new Date(2025, 11, 31));
});

it("splits focus across months and keeps chart totals aligned with task totals, excluding breaks", () => {
  const data = records([
    {
      start: +new Date(2026, 7, 31, 23, 30),
      end: +new Date(2026, 8, 1, 0, 30),
      kind: "focus",
      taskId: "reading",
    },
    {
      start: +new Date(2026, 8, 1, 0, 30),
      end: +new Date(2026, 8, 1, 0, 45),
      kind: "break",
    },
  ]);
  const now = +new Date(2026, 8, 15);
  const month = periodStatistics(data, now, "month");
  assert.equal(month.total, 30 * minute);
  assert.equal(month.taskTotals.get("reading"), month.total);
  assert.equal(
    month.buckets.reduce((sum, bucket) => sum + bucket.ms, 0),
    month.total,
  );
  assert.equal(periodStatistics(data, now, "month", -1).total, 30 * minute);
  assert.equal(periodStatistics(data, now, "year").total, 60 * minute);
});

it("includes live focus only in its matching period and marks future buckets as upcoming", () => {
  const start = +new Date(2026, 7, 31, 23, 50);
  const now = +new Date(2026, 8, 1, 0, 10);
  const data = reduce(defaults(), { type: "start", minutes: 60 }, start, "live");
  const month = periodStatistics(data, now, "month");
  assert.equal(month.total, 10 * minute);
  assert.equal(month.buckets[0].upcoming, false);
  assert(month.buckets.slice(1).every((bucket) => bucket.upcoming && bucket.ms === 0));
  assert.equal(periodStatistics(data, now, "year").total, 20 * minute);
  assert.equal(periodStatistics(defaults(), now, "year").total, 0);
});

it("uses calendar boundaries for both daylight-saving transitions", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    for (const [month, day, hours] of [
      [2, 8, 23],
      [10, 1, 25],
    ]) {
      const start = +new Date(2026, month, day);
      const end = +new Date(2026, month, day + 1);
      const result = periodStatistics(
        records([{ start, end, kind: "focus" }]),
        end + 3600000,
        "month",
      );
      assert.equal(result.buckets[day - 1].ms, hours * 3600000);
      assert.equal(result.total, hours * 3600000);
      const hourly = periodStatistics(
        records([{ start, end, kind: "focus" }]),
        end + 3600000,
        "day",
        -1,
      );
      assert.equal(hourly.start, start);
      assert.equal(hourly.buckets.length, hours);
      assert(hourly.buckets.every((bucket) => bucket.ms === 3600000));
      assert.equal(hourly.total, hours * 3600000);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
