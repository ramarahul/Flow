import type { CSSProperties, ReactNode } from "react";

export function TimerOrbit({
  children,
  taskPicker,
  goalPercent,
}: {
  children: ReactNode;
  taskPicker?: ReactNode;
  goalPercent?: number;
}) {
  return (
    <div
      className={
        "timer-orbit" +
        (taskPicker ? "" : " is-taskless") +
        (goalPercent !== undefined ? " has-goal" : "")
      }
      style={
        goalPercent !== undefined
          ? ({
              "--goal-fill-height": `${Math.min(100, Math.max(0, goalPercent))}%`,
            } as CSSProperties)
          : undefined
      }
    >
      {children}
      {taskPicker}
    </div>
  );
}
