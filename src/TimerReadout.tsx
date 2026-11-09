import { focusTime, remaining, type Timer } from "./domain.js";

function clock(ms: number, countingUp = false) {
  const seconds = countingUp
    ? Math.floor(Math.max(0, ms) / 1000)
    : Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TimerReadout({ timer, now }: { timer: Timer; now: number }) {
  if (!timer.session) return null;
  const isBreak = timer.mode === "break" || timer.mode === "breakDone";
  const left = remaining(timer, now);
  const targetReached = !isBreak && left <= 0;
  const focused = focusTime(timer, now);
  const label = isBreak
    ? "BREAK REMAINING"
    : targetReached
      ? "TIME FOCUSED"
      : "FOCUS REMAINING";
  return (
    <>
      <p className="timer-label">{label}</p>
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
      <p className="timer-caption">
        {isBreak
          ? "Your focus time is saved."
          : targetReached
            ? timer.completedAt !== undefined
              ? "Session complete. Choose your next step within 30 seconds."
              : "Your focus keeps counting automatically."
            : `${clock(focused, true)} focused`}
      </p>
      {targetReached && timer.completedAt === undefined && (
        <p className="target-note">
          {clock(-left, true)} beyond your {Math.round(timer.session.targetMs / 60000)}{" "}
          min target
        </p>
      )}
    </>
  );
}
