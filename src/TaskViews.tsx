import { useState } from "react";
import { ArrowLeft, ChevronDown, Plus, Check, Pencil } from "lucide-react";
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
  send,
  onBack,
}: {
  data: Data;
  now: number;
  send: Send;
  onBack: () => void;
}) {
  const [editor, setEditor] = useState<Task | "new" | null>(null);
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
    try {
      const next = await send({ type: "selectTask", taskId: id, confirm });
      if (next) {
        setPending(null);
        onBack();
      }
    } finally {
      setWorking(false);
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
  const visible = data.tasks.filter((task) => task.archived === showArchived);
  return (
    <section className="subview task-view">
      {showArchived && <h2>Archived tasks</h2>}
      <p className="subtitle">
        {showArchived
          ? "Restore a task to focus on it again."
          : "Choose where your time goes."}
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
          <button
            className="text-button full"
            disabled={working}
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="task-toolbar">
        <button className="secondary" disabled={working} onClick={() => setEditor("new")}>
          <Plus size={15} /> Add task
        </button>
        <button
          className="task-archive-link"
          disabled={working}
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? "Active tasks" : "Archived tasks"}
        </button>
      </div>
      <button
        className="task-card default-task"
        aria-pressed={selected === null}
        disabled={working}
        onClick={() => void choose(null)}
      >
        <span>
          <strong>General</strong>
          <small>{focusDuration(totals.get(null) ?? 0)} today</small>
        </span>
        {selected === null && <Check size={16} />}
      </button>
      {visible.map((task) => {
        const progress = taskProgress(data, task.id, now, totals.get(task.id) ?? 0);
        return (
          <div className="task-list-item" key={task.id}>
            <div className="task-row">
              <button
                className="task-card"
                aria-pressed={selected === task.id}
                disabled={task.archived || working}
                onClick={() => void choose(task.id)}
              >
                <span>
                  <strong>{taskLabel(data, task.id)}</strong>
                  <small>
                    {focusDuration(progress.ms)}
                    {progress.goal ? ` / ${focusDuration(progress.target)}` : " today"}
                  </small>
                </span>
                {selected === task.id && <Check size={16} />}
              </button>
              <button
                className="task-edit"
                disabled={working}
                aria-label={`Edit task: ${task.name}`}
                title={`Edit task: ${task.name}`}
                onClick={() => {
                  setPending(null);
                  setEditor(task);
                }}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
            </div>
            {progress.goal && !task.archived && <GoalProgress progress={progress} />}
          </div>
        );
      })}
      {!visible.length && showArchived && (
        <p className="history-empty">No archived tasks.</p>
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
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState(false);
  return (
    <section className="subview task-view">
      <button className="back-home" disabled={saving} onClick={onBack}>
        <ArrowLeft size={20} /> Back to tasks
      </button>
      <h2>{task ? "Edit task" : "Add task"}</h2>
      <p className="subtitle">
        Choose what to work on and how much time to give it each day.
      </p>
      {task && (
        <div className="task-editor-actions" role="group" aria-label="Task actions">
          <button
            className="secondary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const next = await send({
                  type: "archiveTask",
                  taskId: task.id,
                  archived: !task.archived,
                });
                if (next) onBack();
              } finally {
                setSaving(false);
              }
            }}
          >
            {task.archived ? "Restore task" : "Archive task"}
          </button>
          <button
            className="delete-task"
            disabled={saving}
            onClick={() => setDeleting(true)}
          >
            Delete task
          </button>
        </div>
      )}
      {task && deleting && (
        <div
          className="delete-task-confirm"
          role="alertdialog"
          aria-label={`Delete ${task.name}?`}
        >
          <strong>Delete {task.name}?</strong>
          <p>
            The task and its goal will be removed permanently. Past focus time stays in
            statistics as “Deleted task”.
          </p>
          {data.timer.session?.taskId === task.id && (
            <p>
              Your current session will continue as General without restarting the timer.
            </p>
          )}
          <div>
            <button
              className="secondary"
              autoFocus
              disabled={saving}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </button>
            <button
              className="delete-task"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const next = await send({ type: "deleteTask", taskId: task.id });
                  if (next) onBack();
                } finally {
                  setSaving(false);
                }
              }}
            >
              Delete permanently
            </button>
          </div>
        </div>
      )}
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
            autoFocus
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
          Set a daily goal
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        </label>
        <label>
          Daily goal in minutes
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
          <legend>Goal days</legend>
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
