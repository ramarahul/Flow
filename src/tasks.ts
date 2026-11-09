import type { Data } from "./domain.js";

export interface Task {
  id: string;
  name: string;
  icon?: string;
  archived: boolean;
}
export interface DailyGoal {
  id: string;
  taskId: string;
  targetMinutes: number;
  weekdays: number[];
  enabled: boolean;
}
export type GoalInput = Pick<DailyGoal, "targetMinutes" | "weekdays" | "enabled">;
export type TaskAction =
  | { type: "saveTask"; taskId?: string; name: string; icon?: string; goal: GoalInput }
  | { type: "archiveTask"; taskId: string; archived: boolean };
function taskName(raw: unknown) {
  if (typeof raw !== "string") throw new Error("Enter a task name.");
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 60)
    throw new Error("Use a task name between 1 and 60 characters.");
  if (name.toLowerCase() === "quick focus")
    throw new Error("Quick Focus is reserved. Choose another task name.");
  return name;
}
function taskIcon(raw: unknown) {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string" || Array.from(raw).length > 8)
    throw new Error("Use one short icon or emoji.");
  return raw.trim() || undefined;
}
export function validateGoal(raw: GoalInput): GoalInput {
  if (
    !raw ||
    !Number.isInteger(raw.targetMinutes) ||
    raw.targetMinutes < 1 ||
    raw.targetMinutes > 1440 ||
    !Array.isArray(raw.weekdays) ||
    !raw.weekdays.length ||
    raw.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    typeof raw.enabled !== "boolean"
  )
    throw new Error(
      "Choose a daily target from 1 to 1440 minutes and at least one weekday.",
    );
  return {
    targetMinutes: raw.targetMinutes,
    weekdays: [...new Set(raw.weekdays)].sort(),
    enabled: raw.enabled,
  };
}
export function validateCatalog(
  tasks: unknown,
  goals: unknown,
): { tasks: Task[]; goals: DailyGoal[] } {
  if (
    !Array.isArray(tasks) ||
    !Array.isArray(goals) ||
    tasks.length > 1000 ||
    goals.length > 1000
  )
    throw new Error(
      "Invalid task or goal records. Your stored data has not been replaced.",
    );
  const ids = new Set<string>(),
    names = new Set<string>(),
    goalIds = new Set<string>(),
    goalTasks = new Set<string>();
  const checkedTasks = tasks.map((task: Task) => {
    if (
      !task ||
      typeof task.id !== "string" ||
      !task.id ||
      ids.has(task.id) ||
      typeof task.archived !== "boolean"
    )
      throw new Error("Invalid task records.");
    const name = taskName(task.name);
    if (names.has(name.toLocaleLowerCase()))
      throw new Error("Duplicate task names in data.");
    ids.add(task.id);
    names.add(name.toLocaleLowerCase());
    return { id: task.id, name, icon: taskIcon(task.icon), archived: task.archived };
  });
  const checkedGoals = goals.map((goal: DailyGoal) => {
    if (
      !goal ||
      typeof goal.id !== "string" ||
      !goal.id ||
      goalIds.has(goal.id) ||
      !ids.has(goal.taskId) ||
      goalTasks.has(goal.taskId)
    )
      throw new Error("Invalid daily goal records.");
    goalIds.add(goal.id);
    goalTasks.add(goal.taskId);
    return { id: goal.id, taskId: goal.taskId, ...validateGoal(goal) };
  });
  return { tasks: checkedTasks, goals: checkedGoals };
}
export function updateTasks(data: Data, action: TaskAction, id: string) {
  if (action.type === "archiveTask") {
    const task = data.tasks.find((task) => task.id === action.taskId);
    if (!task || typeof action.archived !== "boolean") throw new Error("Task not found.");
    task.archived = action.archived;
    if (task.archived && data.selectedTaskId === task.id) data.selectedTaskId = null;
    return;
  }
  const name = taskName(action.name),
    icon = taskIcon(action.icon),
    goal = validateGoal(action.goal);
  if (
    data.tasks.some(
      (task) =>
        task.id !== action.taskId &&
        task.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    throw new Error("A task with this name already exists. Check archived tasks too.");
  let task = data.tasks.find((task) => task.id === action.taskId);
  if (action.taskId && !task) throw new Error("Task not found.");
  if (!task) {
    if (data.tasks.length >= 1000) throw new Error("You can keep up to 1000 tasks.");
    task = { id, name, icon, archived: false };
    data.tasks.push(task);
  } else {
    task.name = name;
    task.icon = icon;
  }
  const existing = data.goals.find((item) => item.taskId === task!.id);
  if (existing) Object.assign(existing, goal);
  else data.goals.push({ id: `goal-${id}`, taskId: task.id, ...goal });
}
