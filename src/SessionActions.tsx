import { useEffect, useState } from "react";
import { ChevronDown, Coffee, X } from "lucide-react";
import type { Action, Data } from "./domain.js";
import { targetReached } from "./policy.js";

interface Props {
  data: Data;
  now: number;
  busy: boolean;
  send: (action: Action) => Promise<Data | undefined>;
}

export function SessionActions({ data, now, busy, send }: Props) {
  const t = data.timer;
  const isBreak = t.mode === "break" || t.mode === "breakDone";
  const canFinish = targetReached(t, now);
  const [panel, setPanel] = useState<"extend" | "break" | null>(null);
  const [choice, setChoice] = useState("5");
  const [custom, setCustom] = useState("");

  useEffect(() => setPanel(null), [t.mode, t.session?.targetMs]);
  if (t.mode === "idle" || (!isBreak && !canFinish)) return null;
  if (t.completedAt !== undefined)
    return (
      <section className="session-actions" aria-label="Session actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void send({ type: "repeat" })}
        >
          Repeat session
        </button>
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => void send({ type: "takeBreak" })}
        >
          Take a break
        </button>
        <p className="action-explanation">
          Returning home automatically. Your focused time has stopped.
        </p>
      </section>
    );

  const open = (next: "extend" | "break") => {
    setPanel(panel === next ? null : next);
    const duration = next === "break" ? data.settings.break : 5;
    const presets = next === "break" || isBreak ? [5, 10, 15] : [5, 10, 15, 25];
    setChoice(presets.includes(duration) ? String(duration) : "custom");
    setCustom(String(duration));
  };

  return (
    <section className="session-actions" aria-label="Session actions">
      {!isBreak ? (
        <>
          <button
            className="primary next-break"
            disabled={busy}
            onClick={() => void send({ type: "break", minutes: data.settings.break })}
          >
            <Coffee size={17} /> Take a break <span>{data.settings.break} min</span>
          </button>
          <button
            className="secondary full end-focus"
            disabled={busy}
            aria-describedby="end-focus-description"
            onClick={() => void send({ type: "finish" })}
          >
            End focus
          </button>
          <p className="action-explanation" id="end-focus-description">
            Saves your focus time and returns home.
          </p>
          <details
            className="session-options"
            onToggle={(event) => {
              if (!event.currentTarget.open) setPanel(null);
            }}
          >
            <summary>
              More options <ChevronDown size={14} />
            </summary>
            <div className="optional-actions">
              <button
                disabled={busy}
                aria-expanded={panel === "break"}
                onClick={() => open("break")}
              >
                Choose a different break length
              </button>
              <button
                disabled={busy}
                aria-expanded={panel === "extend"}
                onClick={() => open("extend")}
              >
                Set another focus target
              </button>
            </div>
            {panel && renderPanel()}
          </details>
        </>
      ) : (
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => void send({ type: "skip" })}
        >
          End break
        </button>
      )}
    </section>
  );

  function renderPanel() {
    return (
      <form
        className="action-panel"
        onSubmit={(event) => {
          event.preventDefault();
          const minutes = Number(choice === "custom" ? custom : choice);
          void send({
            type: panel === "break" ? "break" : "extend",
            minutes,
          }).then((result) => {
            if (result) setPanel(null);
          });
        }}
      >
        <div className="action-panel-title">
          <span>{panel === "break" ? "Break length" : "Another focus target"}</span>
          <button
            type="button"
            className="icon"
            aria-label="Close options"
            title="Close options"
            onClick={() => setPanel(null)}
          >
            <X size={14} />
          </button>
        </div>
        {panel === "extend" && (
          <p className="quiet">
            Starts a new countdown and reminder, and turns website blocking back on if
            enabled. Your focused time is preserved.
          </p>
        )}
        <label className="duration-picker">
          <span>Duration</span>
          <select
            aria-label={panel === "break" ? "Break duration" : "New target duration"}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {(panel === "break" || isBreak ? [5, 10, 15] : [5, 10, 15, 25]).map(
              (minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ),
            )}
            <option value="custom">Custom duration</option>
          </select>
        </label>
        {choice === "custom" && (
          <label className="inline-input">
            Minutes
            <input
              aria-label="Custom action minutes"
              type="number"
              min="1"
              max="720"
              required
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
        )}
        <button className="secondary full" disabled={busy}>
          {panel === "break" ? "Start break" : "Set target"}
        </button>
      </form>
    );
  }
}
