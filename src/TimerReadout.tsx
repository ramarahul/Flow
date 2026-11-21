import { focusTime, remaining, type Timer } from "./domain.js";
import type { ReactNode } from "react";
import { TimerOrbit } from "./TimerOrbit.js";

function clock(ms: number, countingUp = false) {
  const seconds = countingUp
    ? Math.floor(Math.max(0, ms) / 1000)
    : Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function timerSessionLabel(timer: Timer, now: number) {
  const isBreak = timer.mode === "break" || timer.mode === "breakDone";
  const targetReached = !isBreak && remaining(timer, now) <= 0;
  return isBreak
    ? "TAKE A BREATHER"
    : targetReached
      ? timer.completedAt !== undefined
        ? "FOCUS COMPLETE"
        : "STILL IN FLOW"
      : "FOCUSING";
}

export function TimerReadout({
  timer,
  now,
  taskPicker,
  goalPercent,
}: {
  timer: Timer;
  now: number;
  taskPicker?: ReactNode;
  goalPercent?: number;
}) {
  if (!timer.session) return null;
  const isBreak = timer.mode === "break" || timer.mode === "breakDone";
  const left = remaining(timer, now);
  const targetReached = !isBreak && left <= 0;
  const focused = focusTime(timer, now);
  return (
    <>
      <TimerOrbit taskPicker={taskPicker} goalPercent={goalPercent}>
        <div className="timer-circle timer-running">
          {!taskPicker && (
            <p className="start-eyebrow">{timerSessionLabel(timer, now)}</p>
          )}
          <div
            className="digits"
            role="timer"
            aria-label={
              targetReached
                ? timer.completedAt !== undefined
                  ? "Completed focus time"
                  : "Total focus time, counting up"
                : isBreak
                  ? "Break time remaining"
                  : "Focus time remaining"
            }
          >
            {clock(targetReached ? focused : left, targetReached)}
          </div>
          {!taskPicker && (
            <span className="start-cue start-hint">
              {isBreak
                ? "Time to recharge"
                : targetReached
                  ? "Time well spent"
                  : `${clock(focused, true)} focused`}
            </span>
          )}
        </div>
      </TimerOrbit>
      {(isBreak || (targetReached && timer.completedAt === undefined)) && (
        <p className="timer-caption">
          {isBreak
            ? "Your focus time is saved."
            : "Your focus keeps counting automatically."}
        </p>
      )}
      {targetReached && timer.completedAt === undefined && (
        <p className="target-note">
          {clock(-left, true)} beyond your {Math.round(timer.session.targetMs / 60000)}{" "}
          min target
        </p>
      )}
    </>
  );
}
