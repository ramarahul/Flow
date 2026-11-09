import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Play,
  Plus,
  Settings2,
  Shield,
  Trash2,
  Upload,
  X,
  ListTodo,
} from "lucide-react";
import {
  defaults,
  focusTime,
  focusActionWindow,
  focusPresets,
  remaining,
  site,
  type Action,
  type Data,
  type Settings,
} from "./domain";
import "./style.css";
import { SessionActions } from "./SessionActions";
import { StatsView } from "./StatsView";
import { TimerReadout } from "./TimerReadout";
import { TaskPicker, TaskViews } from "./TaskViews";
const clock = (ms: number) => {
  const s = Math.ceil(Math.abs(ms) / 1000);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
function App() {
  const [data, setData] = useState<Data>(defaults),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [view, setView] = useState("timer"),
    [minutes, setMinutes] = useState(10),
    [customDuration, setCustomDuration] = useState(false),
    [host, setHost] = useState(""),
    [confirmReset, setConfirmReset] = useState(false);
  const send = async (action: Action) => {
    setBusy(true);
    setError("");
    try {
      if (!chrome.runtime?.id)
        throw new Error("Load the production build as a Chrome extension to use Flow.");
      const response = await chrome.runtime.sendMessage({ action });
      if (response.error) throw new Error(response.error);
      setData(response.data);
      return response.data as Data;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void send({ type: "tick" }).then((d) => {
      if (d) {
        setMinutes(d.settings.focus);
      }
      setLoaded(true);
    });
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.flow) setData(changes.flow.newValue);
    };
    chrome.storage?.onChanged.addListener(listener);
    return () => {
      clearInterval(tick);
      chrome.storage?.onChanged.removeListener(listener);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
  }, [data.settings.theme]);
  const t = data.timer,
    s = data.settings,
    active = t.mode !== "idle",
    isBreak = t.mode === "break" || t.mode === "breakDone",
    left = remaining(t, now),
    overtime = t.mode === "focus" && left <= 0;
  const selectedMinutes = s.showDuration ? minutes : s.focus;
  const previousMode = useRef(t.mode);
  useEffect(() => {
    if (previousMode.current !== "idle" && t.mode === "idle") {
      setView("timer");
      setMinutes(s.focus);
      setCustomDuration(false);
    }
    previousMode.current = t.mode;
  }, [t.mode, s.focus]);
  useEffect(() => {
    if (
      (t.mode === "focus" || t.mode === "break") &&
      !t.paused &&
      !t.notified &&
      left <= 0
    )
      void send({ type: "tick" });
  }, [t.mode, t.paused, t.notified, left <= 0]);
  const completionExpired =
    t.completedAt !== undefined && now >= t.completedAt + focusActionWindow;
  useEffect(() => {
    if (completionExpired) void send({ type: "tick" });
  }, [completionExpired]);
  const update = (patch: Partial<Settings>) =>
    void send({ type: "settings", settings: patch });
  const exportData = () => {
    const blob = new Blob(
      [JSON.stringify({ ...data, timer: defaults().timer }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main>
      <header>
        <button
          className="brand"
          onClick={() => setView("timer")}
          aria-label="Flow timer"
        >
          flow
          <span className="brand-dot">.</span>
        </button>
        <nav aria-label="Main navigation">
          <button
            title="Today's goals"
            aria-label="Today's goals"
            className={view === "goals" ? "selected icon" : "icon"}
            onClick={() => setView(view === "goals" ? "timer" : "goals")}
          >
            <ListTodo size={18} />
          </button>
          <button
            title="Statistics"
            aria-label="Statistics"
            className={view === "stats" ? "selected icon" : "icon"}
            onClick={() => setView(view === "stats" ? "timer" : "stats")}
          >
            <BarChart3 size={18} />
          </button>
          <button
            title="Settings"
            aria-label="Settings"
            className={view === "settings" ? "selected icon" : "icon"}
            onClick={() => setView(view === "settings" ? "timer" : "settings")}
          >
            <Settings2 size={18} />
          </button>
        </nav>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            className="icon"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!loaded ? (
        <div className="loading">Opening your workspace…</div>
      ) : view === "timer" ? (
        <>
          {s.showTask && (
            <TaskPicker data={data} now={now} onOpen={() => setView("tasks")} />
          )}
          <section
            className={"timer " + (isBreak ? "on-break" : "")}
            aria-label="Session timer"
          >
            {!active ? (
              <button
                className="timer-start"
                disabled={
                  busy ||
                  !Number.isFinite(selectedMinutes) ||
                  selectedMinutes < 1 ||
                  selectedMinutes > 720
                }
                onClick={() => void send({ type: "start", minutes: selectedMinutes })}
                aria-label={`Start ${selectedMinutes} minute focus session`}
              >
                <span className="timer-label">FOCUS SESSION</span>
                <span className="digits">{clock(selectedMinutes * 60000)}</span>
                <span className="start-hint">
                  <Play size={13} fill="currentColor" /> Start focus
                </span>
              </button>
            ) : (
              <>
                <TimerReadout timer={t} now={now} />
              </>
            )}
            {!overtime && (
              <div
                className="progress"
                role="progressbar"
                aria-label={isBreak ? "Break progress" : "Focus target progress"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  !active
                    ? 0
                    : Math.min(
                        100,
                        Math.round(
                          (isBreak
                            ? (t.breakTargetMs - Math.max(0, left)) / t.breakTargetMs
                            : focusTime(t, now) / (t.session?.targetMs || 1)) * 100,
                        ),
                      )
                }
              >
                <span
                  style={{
                    width: !active
                      ? "0%"
                      : `${Math.min(100, Math.max(0, (isBreak ? (t.breakTargetMs - Math.max(0, left)) / t.breakTargetMs : focusTime(t, now) / (t.session?.targetMs || 1)) * 100))}%`,
                  }}
                />
              </div>
            )}
          </section>
          {!active ? (
            s.showDuration ? (
              <>
                <label className="duration-picker">
                  <span>Duration</span>
                  <select
                    aria-label="Focus duration"
                    value={
                      customDuration || !focusPresets.includes(minutes)
                        ? "custom"
                        : minutes
                    }
                    onChange={(e) => {
                      const isCustom = e.target.value === "custom";
                      setCustomDuration(isCustom);
                      if (!isCustom) setMinutes(Number(e.target.value));
                    }}
                  >
                    {focusPresets.map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                    <option value="custom">Custom duration</option>
                  </select>
                </label>
                {(customDuration || !focusPresets.includes(minutes)) && (
                  <label className="inline-input">
                    Minutes
                    <span>
                      <input
                        aria-label="Custom focus minutes"
                        type="number"
                        min="1"
                        max="720"
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value))}
                      />{" "}
                      min
                    </span>
                  </label>
                )}
              </>
            ) : null
          ) : (
            <>
              <SessionActions data={data} now={now} busy={busy} send={send} />
            </>
          )}
        </>
      ) : view === "tasks" || view === "goals" ? (
        <TaskViews
          data={data}
          now={now}
          mode={view}
          send={send}
          onBack={() => setView("timer")}
        />
      ) : view === "stats" ? (
        <StatsView data={data} now={now} onBack={() => setView("timer")} />
      ) : (
        <section className="subview settings">
          <button className="back" onClick={() => setView("timer")}>
            <ArrowLeft size={14} /> Timer
          </button>
          <h1>
            Make space<span>.</span>
          </h1>
          <p className="subtitle">Small preferences. A better rhythm.</p>
          <div className="section-label">YOUR DEFAULTS</div>
          <label className="setting">
            Focus duration{" "}
            <span>
              <input
                type="number"
                min="1"
                max="720"
                key={`focus-${s.focus}`}
                defaultValue={s.focus}
                onBlur={(e) => {
                  update({ focus: Number(e.target.value) });
                  if (!e.target.validity.valid) e.target.value = String(s.focus);
                }}
              />{" "}
              min
            </span>
          </label>
          <label className="setting">
            Break duration{" "}
            <span>
              <input
                type="number"
                min="1"
                max="720"
                key={`break-${s.break}`}
                defaultValue={s.break}
                onBlur={(e) => {
                  update({ break: Number(e.target.value) });
                  if (!e.target.validity.valid) e.target.value = String(s.break);
                }}
              />{" "}
              min
            </span>
          </label>
          <label className="setting">
            Appearance
            <select
              value={s.theme}
              onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="setting">
            Show duration on home
            <input
              type="checkbox"
              checked={s.showDuration}
              onChange={(event) => {
                const visible = event.target.checked;
                void send({ type: "settings", settings: { showDuration: visible } }).then(
                  (next) => {
                    if (next) {
                      setMinutes(next.settings.focus);
                      setCustomDuration(false);
                    }
                  },
                );
              }}
            />
          </label>
          <p className="quiet">
            Turn this off for a single-button home screen. The timer will use your default
            focus duration above.
          </p>
          <label className="setting">
            Show task on home
            <input
              type="checkbox"
              checked={s.showTask}
              onChange={(event) => update({ showTask: event.target.checked })}
            />
          </label>
          <p className="quiet">
            Hide the task selector and goal progress on home. Your selected task still
            tracks time. Manage tasks from Today's goals in the header.
          </p>
          <label className="setting">
            Notifications
            <input
              type="checkbox"
              checked={s.notifications}
              onChange={(e) => update({ notifications: e.target.checked })}
            />
          </label>
          <label className="setting">
            Notification sound
            <input
              type="checkbox"
              checked={s.sound}
              onChange={(e) => update({ sound: e.target.checked })}
            />
          </label>
          <p className="quiet">
            Notification sounds follow your operating system settings.
          </p>
          <div className="section-label">
            FEWER DISTRACTIONS
            <Shield size={13} />
          </div>
          <label className="setting">
            Block websites during focus
            <input
              type="checkbox"
              checked={s.blocking}
              disabled={active || busy}
              onChange={async (e) => {
                const enabled = e.target.checked;
                if (enabled) {
                  try {
                    const granted = await chrome.permissions.request({
                      origins: ["http://*/*", "https://*/*"],
                    });
                    if (!granted) {
                      setError("Website access is needed to block your chosen domains.");
                      return;
                    }
                  } catch (e) {
                    setError((e as Error).message);
                    return;
                  }
                }
                update({ blocking: enabled });
              }}
            />
          </label>
          <p className="quiet">
            Only your listed domains are blocked. Blocking pauses during breaks and when
            focus is paused.
          </p>
          {active && (
            <p className="quiet" role="status">
              End focus or end your break to change your blocklist and blocking toggle.
            </p>
          )}
          <form
            className="host-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const next = site(host);
                void send({
                  type: "settings",
                  settings: { ...s, sites: [...new Set([...s.sites, next])] },
                }).then((d) => {
                  if (d) setHost("");
                });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <input
              aria-label="Website domain"
              disabled={active || busy}
              placeholder="e.g. youtube.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
            />
            <button
              className="secondary"
              aria-label="Add website"
              disabled={active || busy}
            >
              <Plus size={16} />
            </button>
          </form>
          <div className="sites">
            {s.sites.map((h) => (
              <div key={h}>
                <span>{h}</span>
                <button
                  className="icon"
                  aria-label={`Remove ${h}`}
                  disabled={active || busy}
                  onClick={() => update({ sites: s.sites.filter((x) => x !== h) })}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="section-label">YOUR LOCAL DATA</div>
          <p className="quiet">
            Exports include saved focus time and preferences. End focus or end your break
            to include the current time.
          </p>
          <div className="data-actions">
            <button className="secondary" onClick={exportData}>
              <Download size={14} /> Export
            </button>
            <label className="secondary import">
              <Upload size={14} /> Import
              <input
                type="file"
                accept="application/json,.json"
                disabled={active || busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 10_000_000)
                      throw new Error("Choose a file smaller than 10 MB.");
                    await send({
                      type: "import",
                      data: JSON.parse(await f.text()),
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {active && (
            <p className="quiet">End focus or end your break before importing.</p>
          )}
          <button
            className="text-button danger"
            disabled={active || busy}
            onClick={() => setConfirmReset(!confirmReset)}
          >
            <Trash2 size={14} /> Reset all data
          </button>
          {confirmReset && (
            <div className="reset-panel">
              <p>This permanently clears your timer, history, and preferences.</p>
              <button
                className="secondary danger"
                disabled={active || busy}
                onClick={() =>
                  void send({ type: "reset" }).then((d) => {
                    if (d) {
                      setConfirmReset(false);
                      setMinutes(d.settings.focus);
                      setCustomDuration(false);
                    }
                  })
                }
              >
                Delete all local data
              </button>
            </div>
          )}
          <p className="privacy">
            Flow 1.0 · Local by design.
            <br />
            No account. No tracking.
          </p>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
