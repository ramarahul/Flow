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
}) => {
  const { page, worker, context, id } = extension;
  await task(page, "Reading");
  await select(page, "Reading");
  await page.getByRole("combobox", { name: "Focus duration" }).selectOption("custom");
  await page.getByLabel("Custom focus minutes").fill("2");
  await page.getByRole("button", { name: "Start 2 minute focus session" }).click();
  const session = (await stored(worker)).timer.session.id;
  await task(page, "Coding", 1);
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
  await page.getByRole("button", { name: "Manage tasks", exact: true }).click();
  await page.getByRole("button", { name: "Edit task & goal" }).click();
  await page.getByLabel("Task name", { exact: true }).fill("Books");
  await page.getByLabel("Daily goal enabled").uncheck();
  await page.getByLabel("Every day").uncheck();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  let data = await stored(worker);
  expect(data.tasks[0].name).toBe("Books");
  expect(data.goals[0].enabled).toBe(false);
  expect(data.goals[0].weekdays).toEqual([1, 2, 3, 4, 5]);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Show archived tasks" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
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
