import { test as base, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname, basename } from "node:path";

const test = base.extend({
  extension: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), "flow-e2e-"));
    const extensionPath = resolve("dist");
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      viewport: { width: 300, height: 650 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    try {
      const worker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      const id = worker.url().split("/")[2];
      const page = await context.newPage();
      await page.goto(`chrome-extension://${id}/index.html`);
      await expect(page.getByRole("button", { name: /Select task/ })).toBeVisible();
      await use({ context, worker, page, id });
    } finally {
      await context.close();
      // Delete only this test-created temporary profile, never a user's profile.
      if (
        dirname(resolve(profile)) !== resolve(tmpdir()) ||
        !basename(profile).startsWith("flow-e2e-")
      )
        throw new Error("Unexpected test profile path");
      await rm(profile, { recursive: true, force: true });
    }
  },
});
const stored = (worker) =>
  worker.evaluate(async () => (await chrome.storage.local.get("flow")).flow);
const command = (page, action) =>
  page.evaluate(async (action) => {
    const result = await chrome.runtime.sendMessage({ action });
    if (result.error) throw new Error(result.error);
    return result.data;
  }, action);

async function task(page, name, target = 2) {
  await page.getByRole("button", { name: /Select task/ }).click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task name", { exact: true }).fill(name);
  await page.getByLabel("Daily target, in minutes").fill(String(target));
  await page.getByRole("button", { name: "Save task", exact: true }).click();
}
async function select(page, name) {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
async function expire(worker, page) {
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow"),
      t = flow.timer,
      s = t.session;
    const elapsed = t.anchor === null ? 0 : Date.now() - t.anchor;
    const left =
      t.mode === "focus"
        ? s.targetMs - s.focusMs - elapsed
        : t.breakTargetMs - t.breakElapsedMs - elapsed;
    const delta = Math.max(0, left) + 1000;
    // Controlled timestamps exercise expiry without sleeping through a full timer.
    s.startedAt -= delta;
    for (const segment of s.segments) {
      segment.start -= delta;
      segment.end -= delta;
    }
    if (t.anchor !== null) t.anchor -= delta;
    await chrome.storage.local.set({ flow });
  });
  await command(page, { type: "tick" });
}

test("loads the real extension and persists a single-button home preference", async ({
  extension,
}, testInfo) => {
  const { page, worker, context, id } = extension;
  await expect(
    page.getByRole("button", { name: "Start 10 minute focus session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // Exercise asynchronous saves even on machines with a fast service worker.
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message.action?.type === "settings")
        await new Promise((resolve) => setTimeout(resolve, 200));
      return send(message);
    };
  });
  const showDuration = page.getByLabel("Show duration on home");
  await expect(showDuration).toBeChecked();
  await showDuration.click();
  await expect(showDuration).not.toBeChecked();
  await expect.poll(async () => (await stored(worker)).settings.showDuration).toBe(false);
  const focus = page.getByRole("spinbutton").first();
  await focus.fill("20");
  await focus.press("Tab");
  await expect.poll(async () => (await stored(worker)).settings.focus).toBe(20);
  await page.getByRole("button", { name: "Flow timer" }).click();
  await expect(
    page.getByRole("button", { name: "Start 20 minute focus session" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Focus duration" })).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(
    reopened.getByRole("button", { name: "Start 20 minute focus session" }),
  ).toBeVisible();
  expect((await stored(worker)).settings.showDuration).toBe(false);
  await reopened.screenshot({ path: testInfo.outputPath("home.png") });
});

test("task switches, goal completion, repeat, breaks and popup restoration share one timer", async ({
  extension,
}, testInfo) => {
  const { page, worker, context, id } = extension;
  await task(page, "Reading");
  await select(page, "Reading");
  await page.getByRole("combobox", { name: "Focus duration" }).selectOption("custom");
  await page.getByLabel("Custom focus minutes").fill("2");
  await page.getByRole("button", { name: "Start 2 minute focus session" }).click();
  const session = (await stored(worker)).timer.session.id;
  await task(page, "Coding", 1);
  await expect(page.getByRole("button", { name: /^Reading/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: /^Coding/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.screenshot({ path: testInfo.outputPath("tasks.png") });
  await select(page, "Coding");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await stored(worker)).timer.session.taskId).toBe(
    (await stored(worker)).tasks.find((task) => task.name === "Reading").id,
  );
  await select(page, "Coding");
  await page.getByRole("button", { name: "Switch and continue" }).click();
  expect((await stored(worker)).timer.session.id).toBe(session);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(reopened.getByRole("timer")).toBeVisible();
  expect((await stored(worker)).timer.session.id).toBe(session);
  await expire(worker, reopened);
  await expect(reopened.getByText("Daily goal reached", { exact: true })).toBeVisible();
  await expect(reopened.getByText("TIME FOCUSED", { exact: true })).toBeVisible();
  const repeated = await command(reopened, { type: "repeat" });
  expect(repeated.timer.session.id).not.toBe(session);
  expect(repeated.timer.session.plannedMs).toBe(120_000);
  expect(repeated.history).toHaveLength(1);
  expect(repeated.timer.session.taskId).toBe(
    repeated.tasks.find((task) => task.name === "Coding").id,
  );
  await expire(worker, reopened);
  await reopened.getByRole("button", { name: /Take a break/ }).click();
  await expect(
    reopened.getByRole("button", { name: "End break", exact: true }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "End break", exact: true }).click();
  await expect(
    reopened.getByRole("button", { name: "Start 10 minute focus session" }),
  ).toBeVisible();
  expect((await stored(worker)).history).toHaveLength(2);
  await reopened.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(reopened.getByRole("heading", { name: "Focus by task" })).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Back to timer" })).toBeVisible();
});

test("edits recurring goals, archives and restores tasks, and keeps Quick Focus available", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await task(page, "Reading", 120);
  await page.getByRole("button", { name: "Edit task: Reading", exact: true }).click();
  await page.getByLabel("Task name", { exact: true }).fill("Books");
  await page.getByLabel("Daily goal enabled").uncheck();
  await page.getByLabel("Every day").uncheck();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  let data = await stored(worker);
  expect(data.tasks[0].name).toBe("Books");
  expect(data.goals[0].enabled).toBe(false);
  expect(data.goals[0].weekdays).toEqual([1, 2, 3, 4, 5]);
  await page.getByRole("button", { name: "Edit task: Books", exact: true }).click();
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  await page.getByRole("button", { name: "Archived tasks", exact: true }).click();
  await page.getByRole("button", { name: "Edit task: Books", exact: true }).click();
  await page.getByRole("button", { name: "Restore task", exact: true }).click();
  expect((await stored(worker)).tasks[0].archived).toBe(false);
  await page.getByRole("button", { name: "Back to timer" }).click();
  await page.getByRole("button", { name: /Select task/ }).click();
  await select(page, "Quick Focus");
  await page.getByRole("button", { name: "Start 10 minute focus session" }).click();
  expect((await stored(worker)).timer.session.taskId).toBeNull();
});

test("returns home without adding focus time when the completion window expires", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await page.getByRole("button", { name: "Start 10 minute focus session" }).click();
  await expire(worker, page);
  await expect(page.getByRole("timer", { name: "Completed focus time" })).toBeVisible();
  expect((await stored(worker)).timer.session.focusMs).toBe(600000);
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    const delta = flow.timer.completedAt - (Date.now() - 31000);
    flow.timer.completedAt -= delta;
    flow.timer.session.startedAt -= delta;
    for (const segment of flow.timer.session.segments) {
      segment.start -= delta;
      segment.end -= delta;
    }
    await chrome.storage.local.set({ flow });
  });
  await command(page, { type: "tick" });
  await expect(
    page.getByRole("button", { name: "Start 10 minute focus session" }),
  ).toBeVisible();
  const saved = await stored(worker);
  expect(saved.history).toHaveLength(1);
  expect(saved.history[0].focusMs).toBe(600000);
});

test("deletes a task with confirmation and retains the permanent default", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await task(page, "Reading");
  await select(page, "Reading");
  await page.getByRole("button", { name: "Start 10 minute focus session" }).click();
  const sessionId = (await stored(worker)).timer.session.id;
  await page.getByRole("button", { name: /Select task/ }).click();
  await expect(
    page.getByRole("button", { name: "Delete task", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit task: Reading", exact: true }).click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Delete Reading?" });
  await expect(confirmation).toContainText("continue as Quick Focus");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await stored(worker)).tasks).toHaveLength(1);
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Reading/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Quick Focus/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const data = await stored(worker);
  expect(data.tasks).toHaveLength(0);
  expect(data.goals).toHaveLength(0);
  expect(data.timer.session.id).toBe(sessionId);
  expect(data.timer.session.taskId).toBeNull();
  await page.getByRole("button", { name: "Archived tasks", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Quick Focus/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit task:/ })).toHaveCount(0);
});

test("hides the home task selector without losing task selection or tracking", async ({
  extension,
}) => {
  const { page, worker, context, id } = extension;
  await task(page, "Reading");
  await select(page, "Reading");
  const taskId = (await stored(worker)).selectedTaskId;
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByLabel("Show task on home", { exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect.poll(async () => (await stored(worker)).settings.showTask).toBe(false);
  await page.getByRole("button", { name: "Flow timer", exact: true }).click();
  await expect(page.getByRole("button", { name: /Select task/ })).toHaveCount(0);
  await expect(
    page.getByRole("progressbar", { name: "Daily goal progress" }),
  ).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(
    reopened.getByRole("button", { name: "Start 10 minute focus session" }),
  ).toBeVisible();
  await expect(reopened.getByRole("button", { name: /Select task/ })).toHaveCount(0);
  await reopened.getByRole("button", { name: "Start 10 minute focus session" }).click();
  expect((await stored(worker)).timer.session.taskId).toBe(taskId);
  await reopened.getByRole("button", { name: "Today's goals", exact: true }).click();
  await expect(reopened.getByRole("button", { name: /^Reading/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await reopened.getByRole("button", { name: "Settings", exact: true }).click();
  await reopened.getByLabel("Show task on home", { exact: true }).click();
  await expect(reopened.getByLabel("Show task on home", { exact: true })).toBeChecked();
  await reopened.getByRole("button", { name: "Flow timer", exact: true }).click();
  await expect(
    reopened.getByRole("button", { name: /Select task.*Reading/ }),
  ).toBeVisible();
});

test("liquid background settles, respects reduced motion, and leaves controls clickable", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const wake = page.locator("canvas.liquid-background");
  const paintedPixels = () =>
    wake.evaluate((element) => {
      const pixels = element
        .getContext("2d")
        .getImageData(0, 0, element.width, element.height).data;
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
      return count;
    });
  await expect(wake).toBeVisible();
  await page.mouse.move(80, 100);
  await page.mouse.move(160, 160, { steps: 8 });
  await expect.poll(paintedPixels).toBeGreaterThan(0);
  const timerSurface = page.locator(".timer-start");
  await expect(timerSurface).toHaveCSS("translate", "none");
  await page.screenshot({ path: testInfo.outputPath("liquid-surface.png") });
  await expect.poll(paintedPixels, { timeout: 8000 }).toBe(0);
  await expect(timerSurface).toHaveCSS("translate", "none");
  await page.mouse.move(190, 180);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(wake).toBeHidden();
  expect(await paintedPixels()).toBe(0);
  await expect(timerSurface).toHaveCSS("translate", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const effect = page.getByRole("checkbox", { name: "Liquid surface effect" });
  await expect(effect).toBeChecked();
  await effect.uncheck();
  await expect(wake).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Liquid surface effect" }),
  ).not.toBeChecked();
  await expect(wake).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Liquid surface effect" }).check();
  await expect(wake).toBeVisible();
  await page.getByRole("button", { name: "Flow timer" }).click();
  await page.getByRole("button", { name: "Start 10 minute focus session" }).click();
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
});

test("keeps the countdown compact with accurate progress and reduced-motion support", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  await page.getByRole("button", { name: "Start 10 minute focus session" }).click();
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
  await expect(page.locator(".screen-content")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("timer")).toHaveCSS("animation-name", "none");
  await expect(
    page.getByRole("progressbar", { name: "Focus target progress" }),
  ).toHaveCount(1);
  await expect(page.locator(".focus-countdown, .focus-dial")).toHaveCount(0);
  await expect(page.locator(".timer button")).toHaveCount(0);
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    flow.timer.anchor -= 120000;
    flow.timer.session.startedAt -= 120000;
    await chrome.storage.local.set({ flow });
  });
  await command(page, { type: "tick" });
  await expect(
    page.getByRole("progressbar", { name: "Focus target progress" }),
  ).toHaveAttribute("aria-valuenow", "20");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("focus-countdown.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator(".screen-content")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("timer")).toHaveCSS("animation-name", "none");
  await expect
    .poll(() =>
      page
        .locator(".timer .progress > span")
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toBe("0s");
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("focus-countdown-dark.png") });
});

test("keeps scrollable screens usable and explains task icons", async ({ extension }) => {
  const { page } = extension;
  for (const name of ["Settings", "Statistics"]) {
    const navigation = page.getByRole("button", { name, exact: true });
    await expect(navigation).toHaveAttribute("title", name);
    await navigation.click();
    const panel = page.locator(".subview");
    const dimensions = await panel.evaluate((element) => ({
      vertical: element.scrollHeight > element.clientHeight,
      horizontal: element.scrollWidth > element.clientWidth,
      gutter: getComputedStyle(element).scrollbarGutter,
      overflow: getComputedStyle(element).overflowY,
    }));
    expect(dimensions.vertical).toBe(true);
    expect(dimensions.horizontal).toBe(false);
    expect(dimensions.gutter).toBe("stable");
    expect(dimensions.overflow).toBe("auto");
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(() => panel.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Flow timer", exact: true }).click();
  await task(page, "Reading");
  const edit = page.getByRole("button", { name: "Edit task: Reading", exact: true });
  await expect(edit).toHaveAttribute("title", "Edit task: Reading");
  await expect(edit.locator("svg")).toBeVisible();
  await expect(edit).toHaveText("");
  await edit.focus();
  await expect(edit).toBeFocused();
  await edit.press("Enter");
  await expect(page.getByLabel("Task name", { exact: true })).toHaveValue("Reading");
});

test("browses saved graph periods and expands older session history", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  await command(page, { type: "start", minutes: 1 });
  await expire(worker, page);
  await command(page, { type: "finish" });
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    const sample = flow.history[0];
    flow.history = Array.from({ length: 7 }, (_, index) => {
      const session = structuredClone(sample);
      const shift = (6 - index) * 10 * 86400000;
      session.id = `history-${index}`;
      session.startedAt -= shift;
      session.endedAt -= shift;
      for (const segment of session.segments) {
        segment.start -= shift;
        segment.end -= shift;
      }
      return session;
    });
    await chrome.storage.local.set({ flow });
  });
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.locator(".session-row")).toHaveCount(0);
  const history = page.locator(".session-history-card > summary");
  await history.click();
  await expect(page.locator(".session-row")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Newer", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Older", exact: true }).click();
  await expect(page.locator(".session-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Older", exact: true })).toBeDisabled();
  await history.click();
  await expect(page.locator(".session-row")).toHaveCount(0);
  await history.focus();
  await history.press("Enter");
  await expect(page.locator(".session-row")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Newer", exact: true })).toBeDisabled();
  await history.click();
  await page.getByRole("combobox", { name: "Graph range" }).selectOption("month");
  const monthDays = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  });
  await expect(page.locator(".week-bar-track")).toHaveCount(monthDays);
  await page
    .locator(".week-card")
    .screenshot({ path: testInfo.outputPath("month-statistics.png") });
  const previous = page.getByRole("button", { name: "Previous graph period" });
  for (let index = 0; index < 4 && (await previous.isEnabled()); index++)
    await previous.click();
  await expect(previous).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next graph period" })).toBeEnabled();
  const pastRange = await page.locator(".week-card .chart-date-range").innerText();
  await page.getByRole("button", { name: "Next graph period" }).click();
  await expect(page.locator(".week-card .chart-date-range")).not.toHaveText(pastRange);
  await page.getByRole("combobox", { name: "Graph range" }).selectOption("year");
  await expect(page.locator(".week-bar-track")).toHaveCount(12);
  const futureMonths = await page.evaluate(() => 11 - new Date().getMonth());
  await expect(page.locator(".future-column")).toHaveCount(futureMonths);
  await page
    .locator(".week-card")
    .screenshot({ path: testInfo.outputPath("year-statistics.png") });
  await expect(page.locator(".task-history-row strong").first()).toHaveText(
    await page.getByLabel("Focus in selected period", { exact: true }).innerText(),
  );
  await page.getByRole("combobox", { name: "Graph range" }).selectOption("week");
  await expect(page.locator(".week-bar-track")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Next graph period" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Graph range" }).selectOption("day");
  await expect(page.getByRole("heading", { name: "Today by hour" })).toBeVisible();
  await expect(page.locator(".day-chart .week-bar-track")).toHaveCount(24);
  await previous.click();
  await expect(page.getByRole("heading", { name: "Day overview" })).toBeVisible();
  await page.getByRole("button", { name: "Next graph period" }).click();
  await expect(page.getByRole("heading", { name: "Today by hour" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next graph period" })).toBeDisabled();
  await page
    .locator(".week-card")
    .screenshot({ path: testInfo.outputPath("day-statistics.png") });
  await page.getByRole("heading", { name: "Your focus" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("statistics.png"), fullPage: true });
});
