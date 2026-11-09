import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Coffee,
  Clock3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { daily, elapsed, focusTime, focusSegments, type Data } from "./domain.js";
import { TaskHistory } from "./TaskHistory.js";
import { taskLabel } from "./goals.js";

const duration = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
};
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
  const [period, setPeriod] = useState(7);
  const [offset, setOffset] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(5);
  const end = new Date(now);
  end.setDate(end.getDate() + offset);
  const days = useMemo(() => daily(data, +end, period), [data, second, period, offset]);
  const today = useMemo(() => daily(data, now, 1)[0].ms, [data, second]);
  const earliest = useMemo(
    () =>
      focusSegments(data, now).reduce(
        (first, segment) => Math.min(first, segment.start),
        now,
      ),
    [data, second],
  );
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
  const week = days.reduce((sum, day) => sum + day.ms, 0);
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
          <h2>{offset === 0 ? `Last ${period} days` : `${period}-day overview`}</h2>
          <span>{duration(week)}</span>
        </div>
        <div className="chart-controls">
          <div className="history-period" aria-label="Graph range">
            {[7, 30].map((value) => (
              <button
                key={value}
                aria-pressed={period === value}
                onClick={() => {
                  setPeriod(value);
                  setOffset(0);
                }}
              >
                {value} days
              </button>
            ))}
          </div>
          <div className="chart-navigation">
            <button
              className="icon"
              aria-label="Previous graph period"
              disabled={+days[0].date <= earliest}
              onClick={() => setOffset(offset - period)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon"
              aria-label="Next graph period"
              disabled={offset === 0}
              onClick={() => setOffset(Math.min(0, offset + period))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <p className="chart-date-range">
          {days[0].date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          –{" "}
          {days[days.length - 1].date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <div
          className={`week-chart ${period === 30 ? "month-chart" : ""}`}
          role="img"
          aria-label={days
            .map(
              (day) =>
                `${day.date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${duration(day.ms)}`,
            )
            .join("; ")}
        >
          {days.map((day, index) => (
            <div
              className={offset === 0 && index === days.length - 1 ? "today-column" : ""}
              key={+day.date}
              title={`${day.date.toLocaleDateString()}: ${duration(day.ms)}`}
            >
              {period === 7 && <small>{duration(day.ms)}</small>}
              <div className="week-bar-track">
                <span style={{ height: `${(day.ms / max) * 100}%` }} />
              </div>
              <span>
                {period === 7
                  ? day.date
                      .toLocaleDateString(undefined, { weekday: "short" })
                      .slice(0, 2)
                  : index % 7 === 0 || index === days.length - 1
                    ? day.date.getDate()
                    : ""}
              </span>
            </div>
          ))}
        </div>
        {!week && <p className="chart-empty">Your focused minutes will appear here.</p>}
      </div>
      <div className="metric-cards">
        <div>
          <Clock3 size={17} />
          <span>All-time focus</span>
          <strong>{duration(total)}</strong>
        </div>
        <div>
          <CheckCircle2 size={17} />
          <span>Finished sessions</span>
          <strong>{completed}</strong>
        </div>
        <div>
          <Coffee size={17} />
          <span>Time on breaks</span>
          <strong>{duration(breaks)}</strong>
        </div>
        <div>
          <CalendarDays size={17} />
          <span>Consecutive days</span>
          <strong>{streak}</strong>
        </div>
      </div>
      <TaskHistory data={data} now={now} />
      <div className="session-history-card">
        <div className="stats-card-title">
          <h2>Session history</h2>
          <span>{data.history.length}</span>
        </div>
        {!data.history.length ? (
          <p className="history-empty">
            Nothing to catch up on.
            <br />
            Your first session starts with the timer.
          </p>
        ) : (
          <div className="session-history-list">
            {data.history
              .slice(-historyLimit)
              .reverse()
              .map((session) => (
                <div className="session-row" key={session.id}>
                  <div>
                    <strong>
                      {new Date(session.startedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
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
                      · {session.outcome === "interrupted" ? "Ended early" : "Finished"}
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
        {data.history.length > historyLimit && (
          <button
            className="secondary full history-more"
            onClick={() => setHistoryLimit(historyLimit + 5)}
          >
            Show 5 more sessions
          </button>
        )}
      </div>
      <p className="stats-storage-note">
        All saved history is available on this device. Export a backup in Settings before
        clearing browser data or removing Flow.
      </p>
    </section>
  );
}
