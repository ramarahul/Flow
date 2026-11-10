import type { Data } from "./domain.js";
import { taskLabel, focusDuration } from "./goals.js";

export function TaskHistory({
  data,
  totals,
  periodLabel,
}: {
  data: Data;
  totals: Map<string | null, number>;
  periodLabel: string;
}) {
  const entries = [...totals].sort((a, b) => b[1] - a[1]);
  return (
    <div className="task-history-card">
      <div className="stats-card-title">
        <h2>Focus by task</h2>
      </div>
      <p className="chart-date-range">{periodLabel}</p>
      <p className="quiet">Same period as the graph. Goal targets are separate.</p>
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
