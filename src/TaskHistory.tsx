import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Data } from "./domain.js";
import { dayWindow, taskTotals, taskLabel, focusDuration } from "./goals.js";

export function TaskHistory({ data, now }: { data: Data; now: number }) {
  const [days, setDays] = useState(1),
    [offset, setOffset] = useState(0);
  const totals = taskTotals(data, now, days, offset);
  const entries = [...totals].sort((a, b) => b[1] - a[1]);
  const start = dayWindow(now, offset - days + 1).date,
    end = dayWindow(now, offset).date;
  const date = (value: Date) =>
    value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="task-history-card">
      <div className="stats-card-title">
        <h2>Focus by task</h2>
        <div className="history-period">
          <button
            aria-pressed={days === 1}
            onClick={() => {
              setDays(1);
              setOffset(0);
            }}
          >
            Daily
          </button>
          <button
            aria-pressed={days === 7}
            onClick={() => {
              setDays(7);
              setOffset(0);
            }}
          >
            Weekly
          </button>
        </div>
      </div>
      <div className="history-date">
        <button
          className="icon"
          aria-label="Previous period"
          onClick={() => setOffset(offset - days)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>{days === 1 ? date(end) : `${date(start)} – ${date(end)}`}</span>
        <button
          className="icon"
          aria-label="Next period"
          disabled={offset >= 0}
          onClick={() => setOffset(Math.min(0, offset + days))}
        >
          <ChevronRight size={17} />
        </button>
      </div>
      <p className="quiet">Actual focus time. Goal targets are separate.</p>
      {entries.length ? (
        entries.map(([id, ms]) => (
          <div className="task-history-row" key={id ?? "quick-focus"}>
            <span>{taskLabel(data, id)}</span>
            <strong>{focusDuration(ms)}</strong>
          </div>
        ))
      ) : (
        <p className="history-empty">No recorded focus in this period.</p>
      )}
    </div>
  );
}
