import {
  defaults,
  migrate,
  reduce,
  remaining,
  focusActionWindow,
  type Action,
  type Data,
} from "./domain.js";
import { authorize } from "./policy.js";
import { blockOpenTab, blockOpenTabs, shouldBlock } from "./blocking.js";
let queue: Promise<unknown> = Promise.resolve();
const notificationAlarmPrefix = "flow-notice:";
const notificationLifetime = focusActionWindow;
async function dismissNotification(id: string) {
  await chrome.notifications.clear(id);
  await chrome.alarms.clear(notificationAlarmPrefix + id);
}
function notificationId(d: Data, isBreak = false): string {
  return `flow-${d.timer.session?.id}-${isBreak ? "break" : "focus"}-${isBreak ? d.timer.breakTargetMs : d.timer.session?.targetMs}`;
}
async function read(): Promise<Data> {
  const stored = await chrome.storage.local.get("flow");
  return stored.flow ? migrate(stored.flow, Date.now()) : defaults();
}
async function sync(d: Data) {
  await chrome.alarms.clear("flow-target");
  const t = d.timer;
  if (t.mode === "focus" && t.completedAt !== undefined)
    await chrome.alarms.create("flow-target", {
      when: Math.max(Date.now() + 1, t.completedAt + focusActionWindow),
    });
  if ((t.mode === "focus" || t.mode === "break") && !t.paused && !t.notified)
    await chrome.alarms.create("flow-target", {
      when: Date.now() + Math.max(1, remaining(t, Date.now())),
    });
  const permitted = await chrome.permissions.contains({
    origins: ["http://*/*", "https://*/*"],
  });
  const rules: chrome.declarativeNetRequest.Rule[] =
    permitted &&
    d.settings.blocking &&
    t.mode === "focus" &&
    !t.paused &&
    remaining(t, Date.now()) > 0
      ? d.settings.sites.map((host, i) => ({
          id: i + 1,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { extensionPath: "/blocked.html" },
          },
          condition: {
            requestDomains: [host],
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
          },
        }))
      : [];
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map((r) => r.id),
    addRules: rules,
  });
  if (permitted) await blockOpenTabs(d);
  await chrome.action.setBadgeText({
    text:
      t.mode === "break"
        ? "II"
        : t.mode === "focus"
          ? t.paused
            ? "II"
            : remaining(t, Date.now()) <= 0
              ? "+"
              : ""
          : "",
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#8060b9" });
}
async function run(
  action: Action,
  fromBlockedPage: boolean,
  expectedNotification?: string,
  sourceUrl?: string,
) {
  const original = await read();
  const now = Date.now();
  const ticked = reduce(original, { type: "tick" }, now);
  const caught = reduce(ticked, { type: "completeTarget" }, now);
  const breakFinished =
    original.timer.mode === "break" &&
    !original.timer.paused &&
    remaining(original.timer, now) <= 0 &&
    action.type === "tick";
  // Check inside the same queue as mutations: old or repeated notification clicks
  // must never extend a different session or a newly extended countdown.
  if (
    expectedNotification &&
    (caught.timer.mode !== "focus" ||
      caught.timer.paused ||
      remaining(caught.timer, now) > 0 ||
      notificationId(caught) !== expectedNotification)
  ) {
    await chrome.storage.local.set({ flow: caught });
    await sync(caught);
    return caught;
  }
  authorize(
    caught,
    action,
    now,
    fromBlockedPage || (!!sourceUrl && shouldBlock(caught, sourceUrl)),
  );
  const next = reduce(caught, action, now, crypto.randomUUID());
  // Persist the notification marker before invoking external effects: no duplicate alerts after wake/restart.
  await chrome.storage.local.set({ flow: next });
  await sync(next);
  if (original.timer.mode === "focus" && next.timer.mode === "idle")
    await dismissNotification(notificationId(original));
  if (
    (breakFinished ||
      (!original.timer.notified && caught.timer.notified && next.timer.notified)) &&
    next.settings.notifications
  ) {
    const isBreak = breakFinished;
    try {
      const id = notificationId(isBreak ? original : caught, isBreak);
      await chrome.alarms.create(notificationAlarmPrefix + id, {
        when: Date.now() + notificationLifetime,
      });
      await chrome.notifications.create(id, {
        type: "basic",
        iconUrl: "icons/128.png",
        title: isBreak ? "Your break is complete" : "Your focus target is reached",
        message: isBreak
          ? "Your session is saved. Start a fresh focus session whenever you are ready."
          : "Your focus time is saved at the target. Take a break or repeat within 30 seconds; otherwise Flow returns home.",
        silent: !next.settings.sound,
        requireInteraction: false,
        ...(!isBreak
          ? {
              buttons: [{ title: "Take a break" }, { title: "Repeat session" }],
            }
          : {}),
      });
    } catch (error) {
      console.warn("Notification unavailable", error);
    }
  }
  return next;
}
function enqueue(
  action: Action,
  fromBlockedPage = false,
  expectedNotification?: string,
  sourceUrl?: string,
) {
  const result = queue.then(() =>
    run(action, fromBlockedPage, expectedNotification, sourceUrl),
  );
  queue = result.catch((error) => console.error("Flow operation failed", error));
  return result;
}
chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (index !== 0 && index !== 1) return;
  void enqueue({ type: index === 0 ? "takeBreak" : "repeat" }, false, id)
    .then(() => dismissNotification(id))
    .catch(() => {
      /* Keep the notification available when persistence fails. */
    });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message?.action) return;
  const fromBlockedPage = sender.url === chrome.runtime.getURL("blocked.html");
  enqueue(
    message.action,
    fromBlockedPage,
    undefined,
    sender.tab ? sender.url : undefined,
  ).then(
    (data) => respond({ data }),
    (error) =>
      respond({
        error: error instanceof Error ? error.message : "Unable to save changes.",
      }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "flow-target") void enqueue({ type: "tick" });
  else if (a.name.startsWith(notificationAlarmPrefix)) {
    const result = queue.then(() =>
      dismissNotification(a.name.slice(notificationAlarmPrefix.length)),
    );
    queue = result.catch((error) => console.warn("Notification cleanup failed", error));
  }
});
chrome.runtime.onStartup.addListener(() => void enqueue({ type: "tick" }));
chrome.runtime.onInstalled.addListener(() => {
  // Remove persistent notifications created by earlier versions on upgrade.
  chrome.notifications.getAll((notices) => {
    void Promise.all(
      Object.keys(notices)
        .filter((id) => id.startsWith("flow-"))
        .map(dismissNotification),
    )
      .then(() => enqueue({ type: "tick" }))
      .catch((error) => console.warn("Notification startup cleanup failed", error));
  });
});
chrome.permissions.onRemoved.addListener(() => void enqueue({ type: "tick" }));
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status !== "complete" && (!change.url || !/^https?:\/\//.test(change.url)))
    return;
  // Restored tabs can finish loading after the startup event. Share the command
  // queue so this check cannot redirect a tab after a break/finish has begun.
  const result = queue.then(async () => {
    const data = await read();
    if (
      await chrome.permissions.contains({
        origins: ["http://*/*", "https://*/*"],
      })
    )
      await blockOpenTab(data, id);
  });
  queue = result.catch((error) => console.warn("Open-tab blocking failed", error));
});
