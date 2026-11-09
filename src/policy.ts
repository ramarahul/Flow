import { focusTime, type Action, type Data, type Timer } from "./domain.js";
export function targetReached(timer: Timer, now: number): boolean {
  return !!timer.session && focusTime(timer, now) >= timer.session.targetMs;
}
// Enforce restrictions at the authoritative command boundary as well as in the UI.
export function authorize(
  data: Data,
  action: Action,
  now: number,
  fromBlockedPage: boolean,
) {
  const t = data.timer;
  if (t.mode !== "idle") {
    if (action.type === "reset" || action.type === "import")
      throw new Error("End focus or end your break before replacing or resetting data.");
    if (action.type === "settings") {
      const next = action.settings;
      if (
        (next.blocking !== undefined && next.blocking !== data.settings.blocking) ||
        (next.sites !== undefined &&
          JSON.stringify(next.sites) !== JSON.stringify(data.settings.sites))
      )
        throw new Error(
          "Website blocking settings are locked until this session is finished.",
        );
    }
  }
  if (t.mode === "focus") {
    if (action.type === "extend" && !targetReached(t, now))
      throw new Error("Extend your session after reaching the current target.");
    if (action.type === "pause" && !fromBlockedPage)
      throw new Error("Pause focus from a blocked website page.");
    if (
      (action.type === "break" ||
        action.type === "finish" ||
        action.type === "takeBreak" ||
        action.type === "repeat") &&
      !targetReached(t, now)
    )
      throw new Error("Reach your focus target before taking a break or finishing.");
  }
}
