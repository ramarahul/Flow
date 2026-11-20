import { after, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { webcrypto } from "node:crypto";
import { defaults, type Action, type Data } from "../src/domain.js";

type Listener = (
  message: { action: Action; popupOpened?: boolean },
  sender: { id: string; url: string; tab?: { id: number } },
  respond: (value: { data?: Data; error?: string }) => void,
) => unknown;
let listener: Listener;
let stored = defaults();
let completion = false;
let badge = "";
let badgeTitle = "";
let toolbarIcon: Record<number, string> = {};
const nativeNow = Date.now;
let testNow = +new Date(2026, 10, 9, 12);
Date.now = () => testNow;
function advance(ms: number) {
  testNow = Math.max(testNow, (stored.timer.anchor ?? testNow) + ms);
}
let rules: chrome.declarativeNetRequest.Rule[] = [];
let permitted = true;
let failWrite = false;
let notifications = 0;
let sounds = 0;
let offscreenOpen = false;
let failSound = false;
let failToolbar = false;
let offscreenCreations = 0;
let notificationButton: (id: string, index: number) => void;
let latestNotice:
  { id: string; options: chrome.notifications.NotificationOptions } | undefined;
let clearedNotices: string[] = [];
let openTabs: chrome.tabs.Tab[] = [];
let overlaidTabs: number[] = [];
let overlayFailure: (() => void) | undefined;
let redirectedTabs: number[] = [];
let failRedirect = false;
let tabUpdated: (id: number, change: { url?: string; status?: string }) => void;
const alarms = new Map<string, { when: number }>();
let alarmFired: (alarm: { name: string }) => void;
const event = { addListener: () => {} };
const mock = {
  tabs: {
    query: async () => structuredClone(openTabs),
    get: async (id: number) => {
      const tab = openTabs.find((tab) => tab.id === id);
      if (!tab) throw new Error("Tab closed");
      return structuredClone(tab);
    },
    update: async (id: number, changes: { url: string }) => {
      if (failRedirect) throw new Error("Tab navigation unavailable");
      const tab = openTabs.find((tab) => tab.id === id);
      if (!tab) throw new Error("Tab closed");
      redirectedTabs.push(id);
      tab.url = changes.url;
      return structuredClone(tab);
    },
    onUpdated: {
      addListener: (listener: typeof tabUpdated) => {
        tabUpdated = listener;
      },
    },
  },
  scripting: {
    executeScript: async (options: { target: { tabId: number }; func: () => void }) => {
      if (overlayFailure) {
        overlayFailure();
        throw new Error("Script injection unavailable");
      }
      assert.equal(typeof options.func, "function");
      overlaidTabs.push(options.target.tabId);
      return [];
    },
  },
  runtime: {
    ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
    getContexts: async () => (offscreenOpen ? [{}] : []),
    sendMessage: async (message: { target: string }) => {
      assert.equal(message.target, "flow-audio");
      if (failSound) return { error: "Audio unavailable" };
      sounds++;
      return { played: true };
    },
    id: "test-flow",
    getURL: (path: string) => `chrome-extension://test-flow/${path}`,
    onMessage: {
      addListener: (callback: Listener) => {
        listener = callback;
      },
    },
    onStartup: event,
    onInstalled: event,
  },
  storage: {
    local: {
      get: async () => ({ flow: structuredClone(stored), flowCompletion: completion }),
      set: async (value: { flow: Data; flowCompletion?: boolean }) => {
        if (failWrite) throw new Error("Storage unavailable");
        stored = structuredClone(value.flow);
        if (value.flowCompletion !== undefined) completion = value.flowCompletion;
      },
    },
  },
  offscreen: {
    Reason: { AUDIO_PLAYBACK: "AUDIO_PLAYBACK" },
    createDocument: async (options: { url: string; reasons: string[] }) => {
      assert.equal(options.url, "offscreen.html");
      assert.deepEqual(options.reasons, ["AUDIO_PLAYBACK"]);
      offscreenOpen = true;
      offscreenCreations++;
    },
  },
  alarms: {
    clear: async (name: string) => alarms.delete(name),
    create: async (name: string, info: { when: number }) => {
      alarms.set(name, info);
    },
    onAlarm: {
      addListener: (listener: typeof alarmFired) => {
        alarmFired = listener;
      },
    },
  },
  permissions: { contains: async () => permitted, onRemoved: event },
  declarativeNetRequest: {
    RuleActionType: { REDIRECT: "redirect" },
    ResourceType: { MAIN_FRAME: "main_frame" },
    getDynamicRules: async () => rules,
    updateDynamicRules: async (value: {
      addRules: chrome.declarativeNetRequest.Rule[];
    }) => {
      rules = value.addRules;
    },
  },
  action: {
    setIcon: async ({ path }: { path: Record<number, string> }) => {
      if (failToolbar) throw new Error("Toolbar icon unavailable");
      toolbarIcon = path;
    },
    setBadgeText: async ({ text }: { text: string }) => {
      badge = text;
    },
    setBadgeBackgroundColor: async () => {},
    setBadgeTextColor: async () => {},
    setTitle: async ({ title }: { title: string }) => {
      badgeTitle = title;
    },
  },
  notifications: {
    getAll: (callback: (notices: { [id: string]: boolean }) => void) =>
      callback(latestNotice ? { [latestNotice.id]: true } : {}),
    onButtonClicked: {
      addListener: (listener: (id: string, index: number) => void) => {
        notificationButton = listener;
      },
    },
    clear: async (id: string) => {
      clearedNotices.push(id);
      return true;
    },
    create: async (id: string, options: chrome.notifications.NotificationOptions) => {
      notifications++;
      latestNotice = { id, options };
      return id;
    },
  },
};
const send = (action: Action, blockedPage = false, popupOpened = false) =>
  new Promise<{ data?: Data; error?: string }>((resolve) =>
    listener(
      { action, popupOpened },
      {
        id: "test-flow",
        url: mock.runtime.getURL(blockedPage ? "blocked.html" : "index.html"),
      },
      resolve,
    ),
  );
{
  Object.defineProperty(globalThis, "chrome", {
    value: mock,
    configurable: true,
  });
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  await import("../src/background.js");
}
describe("background orchestration with mocked Chrome APIs", () => {
  it("plays one independent chime per target with banners disabled and reuses the audio document", async () => {
    await send({
      type: "settings",
      settings: { notifications: false, sound: true, keepCounting: true },
    });
    await send({ type: "start", minutes: 1 });
    advance(65000);
    await Promise.all([send({ type: "tick" }), send({ type: "tick" })]);
    assert.equal(sounds, 1);
    assert.equal(notifications, 0);
    assert.equal(offscreenCreations, 1);
    assert.equal(stored.timer.completedAt, undefined);
    assert.equal(stored.timer.mode, "focus");
    assert.equal(alarms.has("flow-target"), false);
    advance(120000);
    await send({ type: "tick" });
    assert.equal(sounds, 1);
    assert.equal(stored.timer.mode, "focus");
    await send({ type: "takeBreak" });
    advance(6 * 60000);
    await send({ type: "tick" });
    assert.equal(sounds, 2);
    assert.equal(offscreenCreations, 1);
    assert.equal(stored.timer.mode, "idle");
    assert(stored.history[0].focusMs >= 120000);
  });
  it("respects muted sound and plays after a late wake only once", async () => {
    await send({ type: "settings", settings: { sound: false } });
    await send({ type: "start", minutes: 1 });
    advance(65000);
    await send({ type: "tick" });
    assert.equal(sounds, 0);
    assert.equal(latestNotice!.options.silent, true);
    await send({ type: "finish" });
    await send({ type: "settings", settings: { sound: true } });
    await send({ type: "start", minutes: 1 });
    advance(10 * 60000);
    await send({ type: "tick" });
    await send({ type: "tick" });
    assert.equal(sounds, 1);
    assert.equal(stored.timer.mode, "idle");
  });
  it("reports preview failures without affecting the timer and tolerates completion audio failures", async () => {
    failSound = true;
    const preview = await send({ type: "testSound" });
    assert.match(preview.error!, /Audio unavailable/);
    assert.equal(stored.timer.mode, "idle");
    await send({ type: "start", minutes: 1 });
    advance(65000);
    const result = await send({ type: "tick" });
    assert.equal(result.error, undefined);
    assert.equal(stored.timer.anchor, null);
    assert.equal(notifications, 1);
    failSound = false;
    await send({ type: "tick" });
    assert.equal(sounds, 0);
  });
  it("shows running toolbar status through popup opens and clears it on breaks and stopping", async () => {
    await send({ type: "start", minutes: 10 });
    assert.equal(toolbarIcon[16], "icons/running-16.png");
    assert.equal(toolbarIcon[32], "icons/running-32.png");
    assert.equal(badgeTitle, "Flow: Focus running");
    assert.equal(badge, "");
    advance(60000);
    await send({ type: "tick" }, false, true);
    assert.equal(toolbarIcon[16], "icons/running-16.png");
    assert.equal(badge, "");
    await send({ type: "pause" }, true);
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(badgeTitle, "Flow");
    await send({ type: "start", minutes: 1 });
    advance(65000);
    await send({ type: "tick" });
    assert.equal(toolbarIcon[16], "icons/16.png");
    await send({ type: "repeat" });
    assert.equal(toolbarIcon[16], "icons/running-16.png");
    assert.equal(badge, "");
    advance(65000);
    await send({ type: "tick" });
    await send({ type: "takeBreak" });
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(badge, "II");
    await send({ type: "skip" });
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(badge, "");
  });
  it("keeps the quiet running icon during overtime even before completion is acknowledged", async () => {
    await send({ type: "settings", settings: { keepCounting: true } });
    await send({ type: "start", minutes: 1 });
    advance(65000);
    await send({ type: "tick" });
    assert.equal(completion, true);
    assert.equal(toolbarIcon[16], "icons/running-16.png");
    assert.equal(badge, "");
    assert.equal(badgeTitle, "Flow: Focus running");
    await send({ type: "finish" });
    assert.equal(toolbarIcon[16], "icons/16.png");
  });
  it("still sends completion alerts when the toolbar icon update fails", async () => {
    await send({ type: "start", minutes: 1 });
    advance(65000);
    failToolbar = true;
    try {
      const result = await send({ type: "tick" });
      assert.equal(result.error, undefined);
      assert.equal(notifications, 1);
      assert.equal(sounds, 1);
      assert.equal(latestNotice!.options.title, "Focus complete");
      await send({ type: "tick" });
      assert.equal(notifications, 1);
    } finally {
      failToolbar = false;
    }
  });
  it("keeps the completion tooltip without a badge until acknowledged", async () => {
    await send({ type: "start", minutes: 1 });
    advance(65000);
    await send({ type: "tick" });
    assert.equal(badge, "");
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(toolbarIcon[32], "icons/32.png");
    assert.equal(badgeTitle, "Flow: Focus complete");
    advance(60000);
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "idle");
    assert.equal(completion, true);
    assert.equal(badge, "");
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(toolbarIcon[32], "icons/32.png");
    await send({ type: "settings", settings: { sound: true } });
    assert.equal(badge, "");
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(toolbarIcon[32], "icons/32.png");
    // A website overlay cannot pretend that the popup was opened.
    await send({ type: "tick" }, true, true);
    assert.equal(badge, "");
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(toolbarIcon[32], "icons/32.png");
    await send({ type: "tick" }, false, true);
    assert.equal(completion, false);
    assert.equal(badge, "");
    assert.equal(badgeTitle, "Flow");
    assert.equal(toolbarIcon[16], "icons/16.png");
    await send({ type: "tick" });
    assert.equal(badge, "");
  });

  it("keeps completion status after a late wake without changing the normal icon", async () => {
    await send({ type: "settings", settings: { notifications: false } });
    await send({ type: "start", minutes: 1 });
    advance(10 * 60000);
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "idle");
    assert.equal(badge, "");
    assert.equal(toolbarIcon[16], "icons/16.png");
    assert.equal(toolbarIcon[32], "icons/32.png");
    assert.equal(notifications, 0);
    assert.equal(stored.history[0].focusMs, 60000);
    await send({ type: "start", minutes: 1 });
    assert.equal(toolbarIcon[16], "icons/running-16.png");
    assert.equal(badge, "");
    await send({ type: "pause" }, true);
    assert.equal(badge, "");
  });

  it("stops at the target, returns home after the action window, and ignores a late repeat", async () => {
    await send({ type: "start", minutes: 1 });
    const started = testNow;
    advance(65000);
    await send({ type: "tick" });
    const notice = latestNotice!.id;
    assert.equal(stored.timer.session!.focusMs, 60000);
    assert.equal(stored.timer.anchor, null);
    assert.equal(alarms.get("flow-target")!.when, started + 90000);
    testNow = started + 89999;
    await send({ type: "tick" });
    assert.equal(stored.timer.session!.focusMs, 60000);
    testNow = started + 90000;
    alarmFired({ name: "flow-target" });
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "idle");
    assert.equal(stored.history.length, 1);
    assert.equal(stored.history[0].focusMs, 60000);
    assert.equal(stored.history[0].endedAt, started + 60000);
    notificationButton(notice, 1);
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "idle");
    assert.equal(stored.history.length, 1);
  });
  it("caps focused time when Chrome wakes after the action window", async () => {
    await send({ type: "start", minutes: 1 });
    advance(10 * 60000);
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "idle");
    assert.equal(stored.history[0].focusMs, 60000);
    assert.equal(notifications, 0);
  });
  after(() => {
    Date.now = nativeNow;
  });
  beforeEach(() => {
    testNow = +new Date(2026, 10, 9, 12);
    stored = defaults();
    completion = false;
    badge = "";
    badgeTitle = "";
    rules = [];
    notifications = 0;
    sounds = 0;
    offscreenOpen = false;
    failSound = false;
    failToolbar = false;
    offscreenCreations = 0;
    latestNotice = undefined;
    clearedNotices = [];
    openTabs = [];
    overlaidTabs = [];
    overlayFailure = undefined;
    redirectedTabs = [];
    failRedirect = false;
    failWrite = false;
    permitted = true;
    alarms.clear();
  });
  it("serializes rapid starts and finishes into one session record", async () => {
    await Promise.all([
      send({ type: "start", minutes: 25 }),
      send({ type: "start", minutes: 45 }),
    ]);
    assert.equal(stored.timer.session?.targetMs, 25 * 60000);
    advance(26 * 60000);
    await Promise.all([send({ type: "finish" }), send({ type: "finish" })]);
    assert.equal(stored.history.length, 1);
  });
  it("updates domain rules across focus, pause, break and finish", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    assert.equal(rules.length, 0);
    await send({ type: "start", minutes: 25 });
    assert.equal(rules.length, 1);
    await send({ type: "pause" }, true);
    assert.equal(rules.length, 0);
    await send({ type: "resume" });
    assert.equal(rules.length, 0);
    assert.equal(stored.timer.mode, "idle");
    await send({ type: "start", minutes: 25 });
    assert.equal(rules.length, 1);
    advance(26 * 60000);
    await send({ type: "break", minutes: 5 });
    assert.equal(rules.length, 0);
    await send({ type: "skip" });
    await send({ type: "resume" });
    assert.equal(rules.length, 0);
    await send({ type: "finish" });
    assert.equal(rules.length, 0);
  });
  it("schedules persistent deadlines and notifies at most once per target", async () => {
    await send({ type: "start", minutes: 1 });
    assert.equal(alarms.has("flow-target"), true);
    advance(70000);
    await send({ type: "tick" });
    await send({ type: "tick" });
    assert.equal(notifications, 1);
    assert.equal(alarms.has("flow-target"), true);
    assert.equal(stored.history.length, 0);
    await send({ type: "extend", minutes: 5 });
    assert.equal(alarms.has("flow-target"), true);
  });
  it("keeps state intact on storage failure and allows subsequent operations", async () => {
    await send({ type: "start", minutes: 25 });
    const id = stored.timer.session?.id;
    advance(26 * 60000);
    failWrite = true;
    const response = await send({ type: "finish" });
    assert.equal(response.error, "Storage unavailable");
    assert.equal(stored.timer.session?.id, id);
    failWrite = false;
    await send({ type: "finish" });
    assert.equal(stored.history.length, 1);
  });
  it("respects disabled notifications and revoked host permission", async () => {
    await send({
      type: "settings",
      settings: {
        notifications: false,
        blocking: true,
        sites: ["example.com"],
      },
    });
    permitted = false;
    await send({ type: "start", minutes: 1 });
    assert.equal(rules.length, 0);
    advance(70000);
    await send({ type: "tick" });
    assert.equal(notifications, 0);
  });
  it("merges rapid preference updates without overwriting earlier changes", async () => {
    await Promise.all([
      send({ type: "settings", settings: { focus: 45 } }),
      send({ type: "settings", settings: { break: 10 } }),
    ]);
    assert.equal(stored.settings.focus, 45);
    assert.equal(stored.settings.break, 10);
  });
  it("rejects early finish and break and popup pause while allowing blocked-page pause", async () => {
    await send({ type: "start", minutes: 25 });
    assert.match((await send({ type: "finish" })).error!, /Reach your focus target/);
    assert.match(
      (await send({ type: "break", minutes: 5 })).error!,
      /Reach your focus target/,
    );
    assert.match((await send({ type: "pause" })).error!, /blocked website/);
    assert.equal(stored.timer.paused, false);
    assert.equal((await send({ type: "pause" }, true)).error, undefined);
    assert.equal(stored.timer.mode, "idle");
    assert.equal(stored.history[0].outcome, "interrupted");
    await send({ type: "resume" });
    assert.equal(stored.timer.mode, "idle");
  });
  it("locks blocklist and reset throughout active sessions, and unlocks after ending focus", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    await send({ type: "start", minutes: 25 });
    for (const action of [
      { type: "settings", settings: { sites: [] } },
      { type: "settings", settings: { blocking: false } },
      { type: "reset" },
      { type: "import", data: defaults() },
    ] as Action[])
      assert.ok((await send(action)).error);
    advance(25 * 60000 + 1000);
    await send({ type: "break", minutes: 5 });
    assert.ok((await send({ type: "settings", settings: { sites: [] } })).error);
    assert.equal(
      (await send({ type: "settings", settings: { theme: "dark" } })).error,
      undefined,
    );
    await send({ type: "resume" });
    advance(26 * 60000);
    await send({ type: "finish" });
    assert.equal(
      (
        await send({
          type: "settings",
          settings: { sites: [], blocking: false },
        })
      ).error,
      undefined,
    );
    assert.equal(stored.settings.sites.length, 0);
  });
  it("rejects extension during countdown and accepts it only after reaching the target", async () => {
    await send({ type: "start", minutes: 10 });
    assert.match((await send({ type: "extend", minutes: 5 })).error!, /after reaching/);
    advance(10 * 60000 + 1000);
    assert.equal((await send({ type: "extend", minutes: 5 })).error, undefined);
    assert.match((await send({ type: "extend", minutes: 5 })).error!, /after reaching/);
  });
  it("clears alarms and blocking and records partial time once on interrupted focus", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    await send({ type: "start", minutes: 10 });
    advance(123456);
    await Promise.all([send({ type: "pause" }, true), send({ type: "pause" }, true)]);
    assert.equal(stored.timer.mode, "idle");
    assert.equal(rules.length, 0);
    assert.equal(alarms.has("flow-target"), false);
    assert.equal(stored.history.length, 1);
    assert.equal(stored.history[0].outcome, "interrupted");
    assert.ok(stored.history[0].focusMs >= 123456 && stored.history[0].focusMs < 124456);
    assert.equal(
      (await send({ type: "settings", settings: { sites: [] } })).error,
      undefined,
    );
  });
  it("starts the saved break duration from a notification without opening the popup", async () => {
    await send({ type: "start", minutes: 1 });
    const sessionId = stored.timer.session!.id;
    advance(70000);
    await send({ type: "tick" });
    assert.deepEqual(latestNotice!.options.buttons, [
      { title: "Take a break" },
      { title: "Repeat session" },
    ]);
    const id = latestNotice!.id;
    notificationButton(id, 0);
    await send({ type: "tick" });
    assert.equal(stored.timer.session!.id, sessionId);
    assert.equal(stored.history.length, 0);
    assert.equal(alarms.has("flow-target"), true);
    assert.equal(stored.timer.mode, "break");
    assert.equal(stored.timer.breakTargetMs, stored.settings.break * 60000);
    assert.deepEqual(clearedNotices, [id]);
    const target = stored.timer.session!.targetMs;
    notificationButton(id, 1);
    await send({ type: "tick" });
    assert.equal(stored.timer.session!.targetMs, target);
  });
  it("repeats the planned duration and ignores notices from previous sessions", async () => {
    await send({ type: "start", minutes: 1 });
    advance(70000);
    await send({ type: "tick" });
    const id = latestNotice!.id;
    const previousSession = stored.timer.session!.id;
    notificationButton(id, 1);
    await send({ type: "tick" });
    assert.equal(stored.timer.session!.targetMs, 60000);
    assert.notEqual(stored.timer.session!.id, previousSession);
    assert.equal(stored.history.length, 1);
    assert.equal(stored.history[0].focusMs, 60000);
    assert.equal(stored.timer.session!.focusMs, 0);
    await send({ type: "pause" }, true);
    await send({ type: "start", minutes: 10 });
    const target = stored.timer.session!.targetMs;
    notificationButton(id, 0);
    await send({ type: "tick" });
    assert.equal(stored.timer.session!.targetMs, target);
  });
  it("keeps failed notification actions retryable without losing focus time", async () => {
    await send({ type: "start", minutes: 1 });
    advance(70000);
    await send({ type: "tick" });
    const id = latestNotice!.id;
    const target = stored.timer.session!.targetMs;
    failWrite = true;
    notificationButton(id, 0);
    await send({ type: "tick" });
    assert.equal(stored.timer.session!.targetMs, target);
    assert.equal(clearedNotices.length, 0);
    failWrite = false;
    notificationButton(id, 0);
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "break");
    assert.equal(stored.timer.session!.targetMs, target);
    assert.equal(clearedNotices.length, 1);
  });
  it("blocks already-open domains and subdomains immediately without touching unrelated tabs", async () => {
    openTabs = [
      { id: 1, url: "https://example.com/watch" },
      { id: 2, url: "https://sub.example.com/" },
      { id: 3, url: "https://notexample.com/" },
      { id: 4, url: "chrome://settings/" },
    ] as chrome.tabs.Tab[];
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    assert.deepEqual(overlaidTabs, []);
    await send({ type: "start", minutes: 10 });
    assert.deepEqual(overlaidTabs, [1, 2]);
    assert.equal(openTabs[0].url, "https://example.com/watch");
    assert.equal(openTabs[2].url, "https://notexample.com/");
  });
  it("falls back to the blocking page when an open blocked tab rejects the overlay", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    openTabs = [
      { id: 1, url: "https://example.com/" },
      { id: 2, url: "https://unrelated.test/" },
    ] as chrome.tabs.Tab[];
    overlayFailure = () => {};
    const result = await send({ type: "start", minutes: 1 });
    assert.equal(result.error, undefined);
    assert.deepEqual(redirectedTabs, [1]);
    assert.equal(openTabs[0].url, "chrome-extension://test-flow/blocked.html");
    assert.equal(openTabs[1].url, "https://unrelated.test/");
    assert.equal(stored.timer.mode, "focus");
    advance(65000);
    await send({ type: "tick" });
    assert.equal(notifications, 1);
    assert.equal(sounds, 1);
  });
  it("does not redirect a tab that closes, navigates away, or reaches the deadline during injection", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    await send({ type: "start", minutes: 10 });
    for (const change of [
      () => {
        openTabs = [];
      },
      () => {
        openTabs[0].url = "https://unrelated.test/";
      },
      () => {
        advance(11 * 60000);
      },
    ]) {
      openTabs = [{ id: 1, url: "https://example.com/" }] as chrome.tabs.Tab[];
      overlayFailure = change;
      const result = await send({ type: "tick" });
      assert.equal(result.error, undefined);
      assert.deepEqual(redirectedTabs, []);
    }
  });
  it("does not redirect a different site reached during the fallback permission check", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com", "other.test"] },
    });
    openTabs = [{ id: 1, url: "https://example.com/" }] as chrome.tabs.Tab[];
    overlayFailure = () => {};
    const contains = mock.permissions.contains;
    let checks = 0;
    mock.permissions.contains = async () => {
      if (++checks === 2) openTabs[0].url = "https://other.test/";
      return true;
    };
    try {
      assert.equal((await send({ type: "start", minutes: 1 })).error, undefined);
      assert.deepEqual(redirectedTabs, []);
      assert.equal(openTabs[0].url, "https://other.test/");
    } finally {
      mock.permissions.contains = contains;
    }
  });
  it("leaves discarded tabs alone until they are restored", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    openTabs = [
      { id: 1, url: "https://example.com/", discarded: true },
    ] as chrome.tabs.Tab[];
    overlayFailure = () => {};
    assert.equal((await send({ type: "start", minutes: 1 })).error, undefined);
    assert.deepEqual(redirectedTabs, []);
  });
  it("does not bypass revoked site access and still delivers completion alerts after blocking failures", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    openTabs = [{ id: 1, url: "https://example.com/" }] as chrome.tabs.Tab[];
    overlayFailure = () => {
      permitted = false;
    };
    assert.match((await send({ type: "start", minutes: 1 })).error!, /site access/);
    assert.deepEqual(redirectedTabs, []);
    permitted = true;
    failRedirect = true;
    overlayFailure = () => {};
    assert.match((await send({ type: "tick" })).error!, /site access/);
    advance(65000);
    assert.equal((await send({ type: "tick" })).error, undefined);
    assert.equal(notifications, 1);
    assert.equal(sounds, 1);
  });
  it("blocks restored tabs and leaves open tabs accessible during breaks and after interruption", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    await send({ type: "start", minutes: 10 });
    openTabs = [{ id: 1, url: "https://example.com/" }] as chrome.tabs.Tab[];
    tabUpdated(1, { status: "complete" });
    await send({ type: "tick" });
    assert.deepEqual([...new Set(overlaidTabs)], [1]);
    advance(11 * 60000);
    await send({ type: "break", minutes: 5 });
    openTabs[0].url = "https://example.com/";
    overlaidTabs = [];
    tabUpdated(1, { url: openTabs[0].url });
    await send({ type: "tick" });
    assert.deepEqual(overlaidTabs, []);
    await send({ type: "skip" });
    await send({ type: "resume" });
    assert.deepEqual(overlaidTabs, []);
    await send({ type: "start", minutes: 20 });
    assert.deepEqual(overlaidTabs, [1]);
    await send({ type: "pause" }, true);
    openTabs[0].url = "https://example.com/";
    overlaidTabs = [];
    tabUpdated(1, { url: openTabs[0].url });
    await send({ type: "tick" });
    assert.deepEqual(overlaidTabs, []);
  });
  it("accepts interruptions from blocked-site overlays but rejects unrelated content pages", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    await send({ type: "start", minutes: 10 });
    const contentSend = (url: string) =>
      new Promise<{ data?: Data; error?: string }>((respond) =>
        listener(
          { action: { type: "pause" } },
          { id: "test-flow", url, tab: { id: 1 } },
          respond,
        ),
      );
    assert.ok((await contentSend("https://other.com/")).error);
    assert.equal(stored.timer.mode, "focus");
    assert.equal((await contentSend("https://sub.example.com/")).error, undefined);
    assert.equal(stored.timer.mode, "idle");
    assert.equal(stored.history[0].outcome, "interrupted");
  });
  it("releases website blocking at the target without finishing the session, and reapplies it on extension", async () => {
    await send({
      type: "settings",
      settings: { blocking: true, sites: ["example.com"] },
    });
    await send({ type: "start", minutes: 1 });
    assert.equal(rules.length, 1);
    advance(70000);
    await send({ type: "tick" });
    assert.equal(rules.length, 0);
    assert.equal(stored.timer.mode, "focus");
    assert.equal(stored.history.length, 0);
    await send({ type: "extend", minutes: 5 });
    assert.equal(rules.length, 1);
  });
  it("automatically clears unpinned notifications using a persistent 30-second alarm", async () => {
    await send({ type: "start", minutes: 1 });
    advance(70000);
    const before = Date.now();
    await send({ type: "tick" });
    const id = latestNotice!.id;
    assert.equal(latestNotice!.options.requireInteraction, false);
    const expiry = alarms.get("flow-notice:" + id)!;
    assert.ok(expiry.when >= before + 30000 && expiry.when <= Date.now() + 30000);
    const target = stored.timer.session!.targetMs;
    alarmFired({ name: "flow-notice:" + id });
    await send({ type: "tick" });
    assert.ok(clearedNotices.includes(id));
    assert.equal(alarms.has("flow-notice:" + id), false);
    assert.equal(stored.timer.session!.targetMs, target);
    assert.equal(stored.timer.mode, "focus");
  });
  it("finishes expired breaks once, notifies, and allows a new session from home", async () => {
    await send({ type: "start", minutes: 1 });
    advance(70000);
    await send({ type: "break", minutes: 1 });
    const oldId = stored.timer.session!.id;
    assert.ok((await send({ type: "pause" })).error);
    assert.ok((await send({ type: "extendBreak", minutes: 5 })).error);
    advance(70000);
    await send({ type: "tick" });
    assert.equal(stored.timer.mode, "idle");
    assert.equal(stored.history.length, 1);
    assert.equal(stored.history[0].breakMs, 60000);
    const title = latestNotice?.options.title;
    assert.ok(title);
    assert.match(title, /Break complete/);
    const notices = notifications;
    await send({ type: "tick" });
    assert.equal(notifications, notices);
    await send({ type: "start", minutes: 20 });
    assert.notEqual(stored.timer.session!.id, oldId);
  });
  it("persists task switches through the same serialized timer queue", async () => {
    await send({
      type: "saveTask",
      name: "Reading",
      goal: { targetMinutes: 30, weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true },
    });
    await send({
      type: "saveTask",
      name: "Coding",
      goal: { targetMinutes: 60, weekdays: [1, 2, 3, 4, 5], enabled: true },
    });
    const [reading, coding] = stored.tasks;
    await send({ type: "selectTask", taskId: reading.id });
    await send({ type: "start", minutes: 10 });
    const session = stored.timer.session!.id;
    advance(4 * 60000);
    assert.equal(
      (await send({ type: "selectTask", taskId: coding.id })).error,
      undefined,
    );
    assert.equal(stored.timer.session!.id, session);
    assert.equal(stored.timer.session!.focusMs, 4 * 60000);
    assert.equal(stored.timer.session!.segments[0].taskId, reading.id);
    advance(2 * 60000);
    await send({ type: "pause" }, true);
    assert.equal(stored.history[0].segments[1].taskId, coding.id);
    assert.equal(stored.selectedTaskId, coding.id);
    await send({ type: "tick" });
    assert.equal(stored.history.length, 1);
  });
});
