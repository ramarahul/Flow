import { useState } from "react";
import { ArrowLeft, ChevronDown, Plus, Settings2, Check } from "lucide-react";
import type { Action, Data } from "./domain.js";
import type { Task, GoalInput } from "./tasks.js";
import { taskTotals, taskProgress, taskLabel, focusDuration } from "./goals.js";

type Send = (action: Action) => Promise<Data | undefined>;
const allDays = [0, 1, 2, 3, 4, 5, 6];
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TaskPicker({
  data,
  now,
  onOpen,
}: {
  data: Data;
  now: number;
  onOpen: () => void;
}) {
  const id = data.timer.session
    ? (data.timer.session.taskId ?? null)
    : data.selectedTaskId;
  const actual = taskTotals(data, now).get(id) ?? 0;
  const progress = id ? taskProgress(data, id, now, actual) : null;
  return (
    <div className="home-task">
      <button
        className="task-picker"
        onClick={onOpen}
        aria-label={`Select task. ${taskLabel(data, id)}`}
      >
        <span>
          <strong>{taskLabel(data, id)}</strong>
          <small>
            {focusDuration(actual)} today
            {progress?.goal ? ` / ${focusDuration(progress.target)}` : ""}
          </small>
        </span>
        <ChevronDown size={16} />
      </button>
      {progress?.goal && <GoalProgress progress={progress} />}
    </div>
  );
}
function GoalProgress({ progress }: { progress: ReturnType<typeof taskProgress> }) {
  return (
    <div className="goal-progress">
      <div>
        <span>
          {!progress.scheduled
            ? "Not scheduled today"
            : progress.complete
              ? "Daily goal reached"
              : "Today's goal"}
        </span>
        {progress.complete && <Check size={12} />}
      </div>
      {progress.scheduled && (
        <div
          className="goal-track"
          role="progressbar"
          aria-label="Daily goal progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.percent)}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
      )}
    </div>
  );
}

export function TaskViews({
  data,
  now,
  mode,
  send,
  onBack,
}: {
  data: Data;
  now: number;
  mode: "tasks" | "goals";
  send: Send;
  onBack: () => void;
}) {
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [manage, setManage] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, setPending] = useState<{ id: string | null } | null>(null);
  const [working, setWorking] = useState(false);
  const totals = taskTotals(data, now);
  const selected = data.timer.session
    ? (data.timer.session.taskId ?? null)
    : data.selectedTaskId;
  const choose = async (id: string | null, confirm = false) => {
    if (data.timer.session && selected !== id && !confirm) {
      setPending({ id });
      return;
    }
    setWorking(true);
    const next = await send({ type: "selectTask", taskId: id, confirm });
    setWorking(false);
    if (next) {
      setPending(null);
      onBack();
    }
  };
  if (editor)
    return (
      <TaskEditor
        key={editor === "new" ? "new" : editor.id}
        data={data}
        task={editor === "new" ? undefined : editor}
        send={send}
        onBack={() => setEditor(null)}
      />
    );
  const active = data.tasks.filter(
    (task) =>
      task.archived === showArchived &&
      (mode === "tasks" ||
        manage ||
        showArchived ||
        data.goals.some((goal) => goal.taskId === task.id && goal.enabled)),
  );
  return (
    <section className="subview task-view">
      <button className="back-home" onClick={onBack}>
        <ArrowLeft size={20} /> Back to timer
      </button>
      <h1>{mode === "tasks" ? "Choose your focus" : "Today's goals"}</h1>
      <p className="subtitle">
        {mode === "tasks"
          ? "One task at a time."
          : "Small sessions add up. Keep your own pace."}
      </p>
      {pending && (
        <div className="switch-confirm" role="alert">
          <strong>Switch to {taskLabel(data, pending.id)}?</strong>
          <p>
            Time already focused stays with {taskLabel(data, selected)}. Only future focus
            time goes to the new task. Your timer stays the same.
          </p>
          <button
            className="primary"
            disabled={working}
            onClick={() => void choose(pending.id, true)}
          >
            Switch and continue
          </button>
          <button className="text-button full" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}
      {mode === "tasks" && !showArchived && (
        <button
          className="task-card"
          disabled={working}
          onClick={() => void choose(null)}
        >
          <span>
            <strong>Quick Focus</strong>
            <small>{focusDuration(totals.get(null) ?? 0)} today · No daily goal</small>
          </span>
          {selected === null && <Check size={16} />}
        </button>
      )}
      <div className="task-toolbar">
        <button className="secondary" onClick={() => setEditor("new")}>
          <Plus size={15} /> New task
        </button>
        <button
          className="icon"
          aria-label="Manage tasks"
          title="Manage tasks"
          aria-pressed={manage}
          onClick={() => setManage(!manage)}
        >
          <Settings2 size={17} />
        </button>
      </div>
      {manage && (
        <button
          className="text-button full"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? "Show active tasks" : "Show archived tasks"}
        </button>
      )}
      {active.map((task) => {
        const progress = taskProgress(data, task.id, now, totals.get(task.id) ?? 0);
        return (
          <div className="task-list-item" key={task.id}>
            <button
              className="task-card"
              disabled={task.archived || working}
              onClick={() => void choose(task.id)}
            >
              <span>
                <strong>{taskLabel(data, task.id)}</strong>
                <small>
                  {focusDuration(progress.ms)}
                  {progress.goal
                    ? ` / ${focusDuration(progress.target)}`
                    : " today · Goal off"}
                </small>
              </span>
              {selected === task.id && <Check size={16} />}
            </button>
            {progress.goal && !task.archived && <GoalProgress progress={progress} />}
            {manage && (
              <div className="task-management">
                <button onClick={() => setEditor(task)}>Edit task & goal</button>
                <button
                  disabled={working}
                  onClick={async () => {
                    setWorking(true);
                    await send({
                      type: "archiveTask",
                      taskId: task.id,
                      archived: !task.archived,
                    });
                    setWorking(false);
                  }}
                >
                  {task.archived ? "Restore" : "Archive"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!active.length && (
        <p className="history-empty">
          {showArchived
            ? "No archived tasks."
            : mode === "goals" && !manage
              ? "No daily goals yet. Create a task, or manage tasks to enable a goal."
              : "Create a task when you want to focus on something specific."}
        </p>
      )}
    </section>
  );
}

function TaskEditor({
  data,
  task,
  send,
  onBack,
}: {
  data: Data;
  task?: Task;
  send: Send;
  onBack: () => void;
}) {
  const goal = data.goals.find((goal) => goal.taskId === task?.id);
  const [name, setName] = useState(task?.name ?? ""),
    [icon, setIcon] = useState(task?.icon ?? ""),
    [target, setTarget] = useState(goal?.targetMinutes ?? 30),
    [weekdays, setWeekdays] = useState(goal?.weekdays ?? allDays),
    [enabled, setEnabled] = useState(goal?.enabled ?? true),
    [saving, setSaving] = useState(false);
  return (
    <section className="subview task-view">
      <button className="back-home" onClick={onBack}>
        <ArrowLeft size={20} /> Back to tasks
      </button>
      <h1>{task ? "Edit task" : "A new focus"}</h1>
      <p className="subtitle">Your session length and daily goal stay separate.</p>
      <form
        className="task-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const input: GoalInput = { targetMinutes: target, weekdays, enabled };
          const next = await send({
            type: "saveTask",
            taskId: task?.id,
            name,
            icon,
            goal: input,
          });
          setSaving(false);
          if (next) onBack();
        }}
      >
        <label>
          Task name
          <input
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Reading"
          />
        </label>
        <label>
          Icon <span className="quiet">optional</span>
          <input
            maxLength={16}
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            placeholder="e.g. 📖"
          />
        </label>
        <label className="setting">
          Daily goal enabled
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        </label>
        <label>
          Daily target, in minutes
          <input
            type="number"
            min="1"
            max="1440"
            required
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
          />
        </label>
        <div className="goal-presets">
          {[30, 60, 120].map((minutes) => (
            <button
              type="button"
              key={minutes}
              className={target === minutes ? "selected" : ""}
              onClick={() => setTarget(minutes)}
            >
              {minutes} min
            </button>
          ))}
        </div>
        <fieldset>
          <legend>Repeat</legend>
          <label className="repeat-all">
            <input
              type="checkbox"
              checked={weekdays.length === 7}
              onChange={(event) =>
                setWeekdays(event.target.checked ? allDays : [1, 2, 3, 4, 5])
              }
            />{" "}
            Every day
          </label>
          <div className="weekday-picker">
            {dayNames.map((name, day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  aria-label={name}
                  checked={weekdays.includes(day)}
                  onChange={(event) =>
                    setWeekdays(
                      event.target.checked
                        ? [...weekdays, day]
                        : weekdays.filter((value) => value !== day),
                    )
                  }
                />
                <span>{name.slice(0, 2)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save task"}
        </button>
        {task?.archived && (
          <p className="quiet">
            Restore this task from the archived list to select it again.
          </p>
        )}
      </form>
    </section>
  );
}
