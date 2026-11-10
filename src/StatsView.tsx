import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Coffee,
  Clock3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { daily, elapsed, focusTime, type Data } from "./domain.js";
import { TaskHistory } from "./TaskHistory.js";
import { taskLabel, focusDuration } from "./goals.js";
import { periodStatistics, type StatsPeriod } from "./statistics.js";

const duration = focusDuration;
const precise = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function consecutiveDays(data: Data, now: number) {
  const dates = new Set<string>();
  const segments = data.history.flatMap((session) => session.segments);
  const t = data.timer;
  if (t.session) segments.push(...t.session.segments);
  if (t.mode === "focus" && t.anchor !== null)
    segments.push({ start: t.anchor, end: now, kind: "focus" });
  for (const segment of segments) {
    if (segment.kind !== "focus" || segment.end <= segment.start) continue;
    const day = new Date(segment.start);
    day.setHours(0, 0, 0, 0);
    while (+day < segment.end) {
      dates.add(day.toDateString());
      day.setDate(day.getDate() + 1);
    }
  }
  const day = new Date(now);
  let count = 0;
  if (!dates.has(day.toDateString())) day.setDate(day.getDate() - 1);
  while (dates.has(day.toDateString())) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

export function StatsView({
  data,
  now,
  onBack,
}: {
  data: Data;
  now: number;
  onBack: () => void;
}) {
  const second = Math.floor(now / 1000);
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const [offset, setOffset] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const historyPages = Math.max(1, Math.ceil(data.history.length / 5));
  const page = Math.min(historyPage, historyPages - 1);
  const selected = useMemo(
    () => periodStatistics(data, now, period, offset),
    [data, second, period, offset],
  );
  const days = selected.buckets;
  const date = (value: number) =>
    new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const periodLabel =
    period === "day"
      ? date(selected.start)
      : `${date(selected.start)} – ${date(selected.end - 1)}`;
  const bucketLabel = (value: Date) =>
    period === "day"
      ? value.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : value.toLocaleDateString(undefined, {
          month: "short",
          day: period === "year" ? undefined : "numeric",
          year: "numeric",
        });
  const today = useMemo(() => daily(data, now, 1)[0].ms, [data, second]);
  const streak = useMemo(() => consecutiveDays(data, now), [data, second]);
  const total =
    data.history.reduce((sum, session) => sum + session.focusMs, 0) +
    focusTime(data.timer, now);
  const completed = data.history.filter(
    (session) => session.outcome !== "interrupted",
  ).length;
  const breaks =
    data.history.reduce((sum, session) => sum + session.breakMs, 0) +
    (data.timer.session?.breakMs ?? 0) +
    (data.timer.mode === "break"
      ? Math.min(
          Math.max(0, data.timer.breakTargetMs - data.timer.breakElapsedMs),
          elapsed(data.timer, now),
        )
      : 0);
  const max = Math.max(1, ...days.map((day) => day.ms));

  return (
    <section className="subview stats-view" aria-label="Focus statistics">
      <button className="back-home" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>Back to timer</span>
      </button>
      <div className="stats-heading">
        <h1>Your focus</h1>
        <p>A little time, well spent.</p>
      </div>
      <div className="today-card">
        <span>
          <Clock3 size={17} /> Focused today
        </span>
        <strong>{duration(today)}</strong>
        <p>
          {today
            ? "Time you made for what matters."
            : "A fresh day. Begin whenever you’re ready."}
        </p>
      </div>
      <div className="week-card">
        <div className="stats-card-title">
          <h2>
            {offset === 0
              ? period === "day"
                ? "Today by hour"
                : `This ${period}`
              : period === "year"
                ? new Date(selected.start).getFullYear()
                : period === "month"
                  ? new Date(selected.start).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })
                  : period === "day"
                    ? "Day overview"
                    : "Week overview"}
          </h2>
          <span aria-label="Focus in selected period">{duration(selected.total)}</span>
        </div>
        <div className="chart-controls">
          <select
            aria-label="Graph range"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as StatsPeriod);
              setOffset(0);
            }}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          <div className="chart-navigation">
            <button
              className="icon"
              aria-label="Previous graph period"
              title={`Previous ${period}`}
              onClick={() => setOffset((value) => value - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon"
              aria-label="Next graph period"
              title={
                offset === 0 ? "Already showing the current period" : `Next ${period}`
              }
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.min(0, value + 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <p className="chart-date-range">{periodLabel}</p>
        {period === "day" && <p className="quiet">Hours shown in local time (00–23).</p>}
        <div
          className={`week-chart ${period === "day" ? "day-chart" : period === "month" ? "month-chart" : period === "year" ? "year-chart" : ""}`}
          role="img"
          aria-label={days
            .map(
              (day) =>
                `${bucketLabel(day.date)}: ${day.upcoming ? "Upcoming" : duration(day.ms)}`,
            )
            .join("; ")}
        >
          {days.map((day, index) => (
            <div
              className={
                day.upcoming
                  ? "future-column"
                  : day.start <= now && now < day.end
                    ? "today-column"
                    : ""
              }
              key={+day.date}
              title={`${bucketLabel(day.date)}: ${day.upcoming ? "Upcoming" : duration(day.ms)}`}
            >
              {period === "week" && (
                <small>{day.upcoming ? "—" : duration(day.ms)}</small>
              )}
              <div className="week-bar-track">
                <span style={{ height: `${(day.ms / max) * 100}%` }} />
              </div>
              <span>
                {period === "day"
                  ? index % 6 === 0 || index === days.length - 1
                    ? String(day.date.getHours()).padStart(2, "0")
                    : ""
                  : period === "year"
                    ? day.date.toLocaleDateString(undefined, { month: "short" })
                    : period === "week"
                      ? day.date
                          .toLocaleDateString(undefined, { weekday: "short" })
                          .slice(0, 2)
                      : index === days.length - 1 ||
                          (index % 7 === 0 && days.length - 1 - index >= 4)
                        ? day.date.getDate()
                        : ""}
              </span>
            </div>
          ))}
        </div>
        {days.some((day) => day.upcoming) && (
          <p className="chart-upcoming-note">
            Dashed tracks mark upcoming{" "}
            {period === "day" ? "hours" : period === "year" ? "months" : "days"}.
          </p>
        )}
        {!selected.total && (
          <p className="chart-empty">No focused time recorded in this period.</p>
        )}
      </div>
      <TaskHistory data={data} totals={selected.taskTotals} periodLabel={periodLabel} />
      <div className="metric-cards" role="group" aria-label="Overall statistics">
        <div>
          <Clock3 size={17} />
          <span>All-time focus</span>
          <strong>{duration(total)}</strong>
        </div>
        <div>
          <CheckCircle2 size={17} />
          <span>All-time sessions</span>
          <strong>{completed}</strong>
        </div>
        <div>
          <Coffee size={17} />
          <span>All-time breaks</span>
          <strong>{duration(breaks)}</strong>
        </div>
        <div>
          <CalendarDays size={17} />
          <span>Consecutive days</span>
          <strong>{streak}</strong>
        </div>
      </div>
      <details
        className="session-history-card"
        onToggle={(event) => {
          setHistoryOpen(event.currentTarget.open);
          if (!event.currentTarget.open) setHistoryPage(0);
        }}
      >
        <summary className="stats-card-title">
          <h2>All sessions</h2>
          <span>{data.history.length}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        {historyOpen && (
          <>
            {!data.history.length ? (
              <p className="history-empty">
                Nothing to catch up on.
                <br />
                Your first session starts with the timer.
              </p>
            ) : (
              <div className="session-history-list">
                {data.history
                  .slice(
                    Math.max(0, data.history.length - (page + 1) * 5),
                    data.history.length - page * 5,
                  )
                  .reverse()
                  .map((session) => (
                    <div className="session-row" key={session.id}>
                      <div>
                        <strong>
                          {new Date(session.startedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </strong>
                        <small>
                          {[
                            ...new Set(
                              session.segments
                                .filter((segment) => segment.kind === "focus")
                                .map((segment) => segment.taskId ?? null),
                            ),
                          ]
                            .map((id) => taskLabel(data, id))
                            .join(" · ") || taskLabel(data, session.taskId)}
                        </small>
                        <small>
                          {new Date(session.startedAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          ·{" "}
                          {session.outcome === "interrupted" ? "Ended early" : "Finished"}
                        </small>
                        {session.breakMs > 0 && (
                          <small>{duration(session.breakMs)} break</small>
                        )}
                      </div>
                      <span className="session-duration">
                        {precise(session.focusMs)}
                        <small>focused</small>
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {data.history.length > 5 && (
              <nav
                className="session-history-pagination"
                aria-label="Session history pages"
              >
                <button
                  className="secondary"
                  disabled={page === 0}
                  onClick={() => setHistoryPage(Math.max(0, page - 1))}
                >
                  Newer
                </button>
                <span aria-live="polite">
                  {page * 5 + 1}–{Math.min((page + 1) * 5, data.history.length)} of{" "}
                  {data.history.length}
                </span>
                <button
                  className="secondary"
                  disabled={page === historyPages - 1}
                  onClick={() => setHistoryPage(Math.min(historyPages - 1, page + 1))}
                >
                  Older
                </button>
              </nav>
            )}
          </>
        )}
      </details>
      <p className="stats-storage-note">
        All saved history is available on this device. Export a backup in Settings before
        clearing browser data or removing Flow.
      </p>
    </section>
  );
}
