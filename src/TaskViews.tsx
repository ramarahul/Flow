import { useEffect, useId, useRef, useState } from "react";
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
  send,
  variant = "row",
  context,
}: {
  data: Data;
  now: number;
  onOpen: () => void;
  send?: Send;
  variant?: "row" | "orbit";
  context?: string;
}) {
  const id = data.timer.session
    ? (data.timer.session.taskId ?? null)
    : data.selectedTaskId;
  const actual = taskTotals(data, now).get(id) ?? 0;
  const progress = taskProgress(data, id, now, actual);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    root.current
      ?.querySelector<HTMLButtonElement>(".quick-task-list [aria-pressed='true']")
      ?.focus();
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = async (taskId: string | null) => {
    if (!send) return;
    setWorking(true);
    try {
      if (await send({ type: "selectTask", taskId })) close();
      else trigger.current?.focus();
    } finally {
      setWorking(false);
    }
  };
  return (
    <div
      ref={root}
      className={"home-task" + (variant === "orbit" ? " task-orbit" : "")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !working)
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="task-control">
        {variant === "orbit" && (
          <span
            className="task-context"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {context ?? "Task"}
          </span>
        )}
        <button
          ref={trigger}
          className="task-picker"
          onClick={() => (send ? setOpen(!open) : onOpen())}
          aria-expanded={send ? open : undefined}
          aria-controls={send && open ? menuId : undefined}
          aria-haspopup={send ? "dialog" : undefined}
          aria-label={`Select task. ${taskLabel(data, id)}`}
          title={
            variant === "orbit"
              ? `Change task: ${taskLabel(data, id)}`
              : taskLabel(data, id)
          }
        >
          <span>
            <strong>
              <span className="task-name">{taskLabel(data, id)}</span>
            </strong>
            {variant === "row" && (
              <small>
                {focusDuration(actual)} today
                {progress?.goal ? ` / ${focusDuration(progress.target)}` : ""}
              </small>
            )}
          </span>
          {variant === "row" && <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <>
          <button
            className="quick-task-dismiss"
            aria-label="Close task list"
            tabIndex={-1}
            onClick={close}
          />
          <div
            className="quick-task-list"
            id={menuId}
            role="dialog"
            aria-label="Choose task"
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            }}
          >
            <div className="quick-task-options">
              {[null, ...data.tasks.filter((task) => !task.archived)].map((task) => {
                const taskId = task?.id ?? null;
                return (
                  <button
                    key={taskId ?? "general"}
                    disabled={working}
                    aria-pressed={id === taskId}
                    onClick={() => void choose(taskId)}
                  >
                    <span>{taskLabel(data, taskId)}</span>
                    {id === taskId && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <button
              className="quick-task-manage"
              disabled={working}
              onClick={() => {
                setOpen(false);
                onOpen();
              }}
            >
              Manage tasks
            </button>
          </div>
        </>
      )}
      {progress?.goal ? (
        <GoalProgress
          progress={progress}
          summary={
            variant === "orbit"
              ? `Today ${focusDuration(actual)}${progress.scheduled ? ` \u00b7 Goal ${focusDuration(progress.target)}` : ""}`
              : undefined
          }
        />
      ) : (
        variant === "orbit" && (
          <span className="orbit-task-summary">Today {focusDuration(actual)}</span>
        )
      )}
    </div>
  );
}
function GoalProgress({
  progress,
  summary,
}: {
  progress: ReturnType<typeof taskProgress>;
  summary?: string;
}) {
  return (
    <div className="goal-progress">
      <div
        className={
          progress.scheduled && !progress.complete ? "goal-progress-label" : undefined
        }
      >
        <span>
          {summary ??
            (!progress.scheduled
              ? "Not scheduled today"
              : progress.complete
                ? "Daily goal reached"
                : "Today's goal")}
        </span>
        {progress.complete && (
          <Check size={10} role="img" aria-label="Daily goal reached" />
        )}
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
  const [editor, setEditor] = useState<Task | "new" | "general" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [working, setWorking] = useState(false);
  const totals = taskTotals(data, now);
  const selected = data.timer.session
    ? (data.timer.session.taskId ?? null)
    : data.selectedTaskId;
  const choose = async (id: string | null) => {
    setWorking(true);
    try {
      const next = await send({ type: "selectTask", taskId: id });
      if (next) {
        onBack();
      }
    } finally {
      setWorking(false);
    }
  };
  if (editor)
    return (
      <TaskEditor
        key={typeof editor === "string" ? `editor-${editor}` : `task-${editor.id}`}
        data={data}
        task={typeof editor === "string" ? undefined : editor}
        general={editor === "general"}
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
      <div className="task-list" role="list" aria-label="Tasks">
        {[null, ...visible].map((task) => {
          const id = task?.id ?? null;
          const name = task?.name ?? data.generalTask?.name ?? "General";
          const progress = taskProgress(data, id, now, totals.get(id) ?? 0);
          return (
            <div
              className={"task-list-item" + (selected === id ? " is-selected" : "")}
              role="listitem"
              key={id === null ? "default-task" : `task-${id}`}
            >
              <div className="task-row">
                <button
                  className={"task-card" + (task ? "" : " default-task")}
                  aria-pressed={selected === id}
                  disabled={task?.archived || working}
                  onClick={() => void choose(id)}
                >
                  <span className="task-details">
                    <strong>
                      <span title={taskLabel(data, id)}>{taskLabel(data, id)}</span>
                      {selected === id && <Check size={12} aria-hidden="true" />}
                    </strong>
                    <small className="task-metadata">
                      {progress.goal
                        ? `Daily goal ${focusDuration(progress.target)}`
                        : "No daily goal"}
                    </small>
                  </span>
                  <span className="task-time">
                    <b>{focusDuration(progress.ms)}</b>
                    <small>today</small>
                  </span>
                </button>
                <button
                  className="task-edit"
                  disabled={working}
                  aria-label={`Edit task: ${name}`}
                  title={`Edit task: ${name}`}
                  onClick={() => {
                    setEditor(task ?? "general");
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
              </div>
              {progress.goal && !task?.archived && <GoalProgress progress={progress} />}
            </div>
          );
        })}
      </div>
      {!visible.length && showArchived && (
        <p className="history-empty">No archived tasks.</p>
      )}
    </section>
  );
}
function TaskEditor({
  data,
  task,
  general = false,
  send,
  onBack,
}: {
  data: Data;
  task?: Task;
  general?: boolean;
  send: Send;
  onBack: () => void;
}) {
  const details = general ? (data.generalTask ?? { name: "General" }) : task;
  const goal = data.goals.find((goal) => goal.taskId === (general ? null : task?.id));
  const [name, setName] = useState(details?.name ?? ""),
    [icon, setIcon] = useState(details?.icon ?? ""),
    [target, setTarget] = useState(goal?.targetMinutes ?? 30),
    [weekdays, setWeekdays] = useState(goal?.weekdays ?? allDays),
    [enabled, setEnabled] = useState(goal?.enabled ?? !general),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState(false);
  return (
    <section className="subview task-view">
      <button className="back-home" disabled={saving} onClick={onBack}>
        <ArrowLeft size={20} /> Back to tasks
      </button>
      <h2>{task || general ? "Edit task" : "Add task"}</h2>
      <p className="subtitle">
        Choose what to work on and how much time to give it each day.
      </p>
      {general && (
        <p className="quiet">
          Your permanent default task. Edit its details and goal; it cannot be archived or
          deleted.
        </p>
      )}
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
              Your current session will continue as {taskLabel(data, null)} without
              restarting the timer.
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
            taskId: general ? null : task?.id,
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
