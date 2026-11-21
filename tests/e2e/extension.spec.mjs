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

async function navigate(page, name) {
  await page.getByText("Menu", { exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("keeps navigation and pages visible when the popup resizes to its content", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  const settlePopup = async () => {
    let settled = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const bounds = await page.locator("main").boundingBox();
      const size = { width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) };
      const current = page.viewportSize();
      if (current.width === size.width && current.height === size.height) {
        settled = true;
        break;
      }
      await page.setViewportSize(size);
    }
    expect(
      settled,
      "Popup sizing must stabilize instead of shrinking on every resize",
    ).toBe(true);
  };
  const checkMenu = async (name) => {
    await page.getByText("Menu", { exact: true }).click();
    await settlePopup();
    await page
      .locator(".app-menu nav")
      .evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished)),
      );
    for (const destination of ["Timer", "Tasks", "Statistics", "Settings"]) {
      const button = page.getByRole("button", { name: destination, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(
        await button.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          );
        }),
      ).toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(`navigation-${name.toLowerCase()}.png`),
    });
    await page.keyboard.press("Escape");
  };
  for (const name of ["Settings", "Tasks", "Statistics", "Timer"]) {
    await navigate(page, name);
    await settlePopup();
    const panel = page.locator(".subview");
    if (await panel.count())
      expect((await panel.boundingBox()).height).toBeGreaterThan(100);
    await checkMenu(name);
  }
  await command(page, {
    type: "settings",
    settings: { showTask: false, showDuration: false },
  });
  await command(page, { type: "start", minutes: 1 });
  await settlePopup();
  await checkMenu("short-timer");
});

test("unveils the menu smoothly without resizing and reveals keyboard focus immediately", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const menu = page.locator(".app-menu");
  const trigger = menu.locator("summary");
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    const before = await page.locator("main").boundingBox();
    await trigger.focus();
    await trigger.press(theme === "light" ? "Enter" : "Space");
    await expect(nav).toHaveCSS("animation-name", "menu-unveil");
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveText("Timer");
    const stages = await nav.evaluate((element) => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
      const start = getComputedStyle(element).clipPath;
      animation.currentTime = 110;
      const middle = getComputedStyle(element).clipPath;
      animation.finish();
      return { start, middle };
    });
    expect(stages.middle).not.toBe(stages.start);
    expect(await page.locator("main").boundingBox()).toEqual(before);
    await page
      .locator("main")
      .screenshot({ path: testInfo.outputPath(`menu-${theme}.png`) });
    await page.keyboard.press("Tab");
    await expect(current).toBeFocused();
    await expect(current).toHaveCSS("outline-style", "solid");
    for (const name of ["Tasks", "Statistics", "Settings"]) {
      await page.keyboard.press("Tab");
      await expect(nav.getByRole("button", { name, exact: true })).toBeFocused();
    }
    await expect(nav).toHaveCSS("animation-name", "none");
    await expect(nav).toHaveCSS("clip-path", "none");
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open");
    await expect(menu.locator("summary")).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByText("Menu", { exact: true }).click();
  await expect(nav).toHaveCSS("animation-name", "none");
  await expect(nav).toHaveCSS("opacity", "1");
  await expect(nav).toHaveCSS("clip-path", "none");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Tasks" })).toBeVisible();
  await expect(menu).not.toHaveAttribute("open");
});

test("keeps timer and statistics surfaces dark in explicit and system dark modes", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const surface = (locator) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      let backgroundStyle = style;
      let ancestor = element;
      while (
        backgroundStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
        backgroundStyle.backgroundImage === "none" &&
        ancestor.parentElement
      ) {
        ancestor = ancestor.parentElement;
        backgroundStyle = getComputedStyle(ancestor);
      }
      const colors =
        ancestor === element
          ? [
              ...backgroundStyle.backgroundImage.matchAll(/rgba?\((\d+), (\d+), (\d+)/g),
            ].map((match) => match.slice(1).map(Number))
          : [];
      if (!colors.length)
        colors.push(
          backgroundStyle.backgroundColor.match(/\d+/g).slice(0, 3).map(Number),
        );
      const text = style.color.match(/\d+/g).slice(0, 3).map(Number);
      const luminance = (rgb) =>
        rgb
          .map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      return {
        colors,
        contrast: colors.map(
          (color) =>
            (Math.max(luminance(text), luminance(color)) + 0.05) /
            (Math.min(luminance(text), luminance(color)) + 0.05),
        ),
      };
    });
  for (const theme of ["dark", "system"]) {
    await command(page, { type: "settings", settings: { theme } });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const timer = page.locator(".timer-ready");
    for (const hovered of [false, true]) {
      if (hovered) await timer.hover();
      else await page.mouse.move(299, 649);
      const appearance = await surface(timer);
      await expect(timer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(timer).toHaveCSS("box-shadow", "none");
      await expect(page.locator(".timer-start")).toHaveCSS("transform", "none");
      expect(
        appearance.colors.every((rgb) => rgb.every((channel) => channel < 120)),
      ).toBe(true);
      expect(Math.min(...appearance.contrast)).toBeGreaterThan(4.5);
    }
    expect(
      Math.min(...(await surface(page.locator(".orbit-task-summary"))).contrast),
    ).toBeGreaterThan(4.5);
    await page.screenshot({ path: testInfo.outputPath(`home-${theme}.png`) });
    await navigate(page, "Statistics");
    const summary = await surface(page.locator(".today-card"));
    expect(summary.colors.every((rgb) => rgb.every((channel) => channel < 120))).toBe(
      true,
    );
    expect(Math.min(...summary.contrast)).toBeGreaterThan(4.5);
    await page.screenshot({ path: testInfo.outputPath(`statistics-${theme}.png`) });
    await navigate(page, "Timer");
  }
  await command(page, { type: "settings", settings: { theme: "light" } });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(228, 220, 250)");
  await page.mouse.move(299, 649);
  expect(
    Math.min(...(await surface(page.locator(".timer-ready"))).contrast),
  ).toBeGreaterThan(4.5);
});

async function openTasks(page) {
  await page.getByRole("button", { name: /Select task/ }).press("Enter");
  await page.getByRole("button", { name: "Manage tasks", exact: true }).click();
}

test("returns directly from Tasks to the timer through either entry point", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  await page.setViewportSize({ width: 300, height: 340 });
  const back = page.getByRole("button", { name: "Back to timer", exact: true });
  const timer = page.getByRole("region", { name: "Session timer" });
  await openTasks(page);
  await expect(back).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("tasks-back-light.png") });
  await back.click();
  await expect(timer).toBeVisible();

  await command(page, { type: "settings", settings: { theme: "dark" } });
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await expect.poll(async () => (await stored(worker)).timer.mode).toBe("focus");
  const session = (await stored(worker)).timer.session;
  await navigate(page, "Tasks");
  await back.focus();
  await page.screenshot({ path: testInfo.outputPath("tasks-back-dark.png") });
  await page.keyboard.press("Enter");
  await expect(timer).toBeVisible();
  await expect(page.locator(".app-menu summary")).toBeFocused();
  expect((await stored(worker)).timer.session).toEqual(session);
});

test("returns directly from Statistics and Settings to the timer", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  await page.setViewportSize({ width: 300, height: 340 });
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    for (const name of ["Statistics", "Settings"]) {
      await navigate(page, name);
      const back = page.getByRole("button", { name: "Back to timer", exact: true });
      await expect(back).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath(`${name}-${theme}.png`) });
      await back.press("Enter");
      await expect(page.getByRole("region", { name: "Session timer" })).toBeVisible();
      await expect(page.locator(".app-menu summary")).toBeFocused();
    }
  }
});

test("switches tasks in place with a compact keyboard-accessible dropdown", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  await page.setViewportSize({ width: 300, height: 340 });
  const goal = { enabled: false, targetMinutes: 20, weekdays: [0, 1, 2, 3, 4, 5, 6] };
  await command(page, { type: "saveTask", name: "Reading", goal });
  await command(page, { type: "saveTask", name: "Writing", goal });
  const trigger = page.getByRole("button", { name: /Select task/ });
  const circle = await page.locator(".timer-circle").boundingBox();
  expect((await trigger.boundingBox()).width).toBeLessThan(110);
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await trigger.click();
    const list = page.getByRole("dialog", { name: "Choose task" });
    await expect(
      list.getByRole("button", { name: "General", exact: true }),
    ).toBeFocused();
    const bounds = await list.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(300);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(340);
    await page.screenshot({ path: testInfo.outputPath(`quick-tasks-${theme}.png`) });
    await page.keyboard.press("ArrowDown");
    await expect(
      list.getByRole("button", { name: "Reading", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await page
    .getByRole("dialog", { name: "Choose task" })
    .getByRole("button", { name: "Reading", exact: true })
    .click();
  await expect(trigger).toHaveAccessibleName("Select task. Reading");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Choose task" })).toHaveCount(0);
  expect((await stored(worker)).timer.mode).toBe("idle");
  expect(await page.locator(".timer-circle").boundingBox()).toEqual(circle);
  await trigger.click();
  await page
    .getByRole("button", { name: "Close task list", exact: true })
    .click({ position: { x: 20, y: 65 } });
  expect((await stored(worker)).timer.mode).toBe("idle");
  // The space next to the short task name still belongs to the start button.
  await page.mouse.click(circle.x + 35, circle.y + 65);
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
  const session = (await stored(worker)).timer.session.id;
  await trigger.click();
  await page
    .getByRole("dialog", { name: "Choose task" })
    .getByRole("button", { name: "Writing", exact: true })
    .click();
  await expect(trigger).toHaveAccessibleName("Select task. Writing");
  expect((await stored(worker)).timer.session.id).toBe(session);
  await expect(page.getByRole("heading", { name: "Your Tasks" })).toHaveCount(0);
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) =>
      message.action?.type === "selectTask"
        ? { error: "Unable to change task." }
        : send(message);
  });
  await trigger.click();
  await page
    .getByRole("dialog", { name: "Choose task" })
    .getByRole("button", { name: "General", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Unable to change task.");
  await expect(trigger).toHaveAccessibleName("Select task. Writing");
  expect((await stored(worker)).timer.session.id).toBe(session);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Choose task" })).toHaveCount(0);
});

async function task(page, name, target = 2) {
  await openTasks(page);
  await expect(
    page.getByRole("heading", { name: "Your Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.locator('.app-menu button[aria-current="page"]')).toHaveText("Tasks");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task name", { exact: true }).fill(name);
  await page.getByLabel("Daily goal in minutes").fill(String(target));
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

test("keeps every page and setting compact, usable, and consistent in both themes", async ({
  extension,
}, testInfo) => {
  test.setTimeout(90_000);
  const { page, worker, context, id } = extension;
  const snapshot = async (name) => {
    const main = page.locator("main");
    expect((await main.boundingBox()).width).toBe(300);
    if ((await main.getAttribute("data-view")) === "timer") {
      expect((await main.boundingBox()).height).toBe(340);
    } else {
      expect((await main.boundingBox()).height).toBeLessThanOrEqual(500);
    }
    const panel = page.locator(".subview");
    if (await panel.count()) {
      expect(
        await panel.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
    }
    await main.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  };
  await navigate(page, "Settings");
  await page.getByRole("spinbutton").first().fill("20");
  await page.getByRole("spinbutton").first().press("Tab");
  await expect.poll(async () => (await stored(worker)).settings.focus).toBe(20);
  await page.getByRole("spinbutton").nth(1).fill("3");
  await page.getByRole("spinbutton").nth(1).press("Tab");
  await expect.poll(async () => (await stored(worker)).settings.break).toBe(3);
  for (const [label, key, value] of [
    ["Keep counting after target", "keepCounting", true],
    ["Show duration on home", "showDuration", false],
    ["Show task on home", "showTask", false],
    ["Liquid surface effect", "liquidEffect", false],
    ["Notifications", "notifications", false],
    ["Completion sound", "sound", false],
  ]) {
    await page.getByRole("checkbox", { name: label, exact: true }).setChecked(value);
    await expect.poll(async () => (await stored(worker)).settings[key]).toBe(value);
  }
  await page.getByRole("textbox", { name: "Website domain" }).fill("example.com");
  await page.getByRole("button", { name: "Add website", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove example.com" })).toBeVisible();
  await page.getByRole("button", { name: "Remove example.com" }).click();
  await expect.poll(async () => (await stored(worker)).settings.sites).toEqual([]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^flow-.*\.json$/);
  const backup = await stored(worker);
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect.poll(async () => (await stored(worker)).settings.focus).toBe(20);
  await page.getByRole("button", { name: "Reset all data", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Reset all local data?" }),
  ).toBeVisible();
  await snapshot("reset-confirmation");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    for (const group of [
      "Timing",
      "Appearance",
      "Alerts",
      "Website blocking",
      "Local data",
    ]) {
      await page
        .getByRole("region", { name: group, exact: true })
        .scrollIntoViewIfNeeded();
      await snapshot(`settings-${group.toLowerCase().replaceAll(" ", "-")}-${theme}`);
    }
  }
  await page.reload();
  await navigate(page, "Settings");
  await expect(
    page.getByRole("checkbox", { name: "Keep counting after target" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Completion sound" }),
  ).not.toBeChecked();
  await command(page, {
    type: "settings",
    settings: { showTask: true, showDuration: true, keepCounting: false },
  });
  await navigate(page, "Timer");
  await task(page, "A long reading and writing task for the afternoon");
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await snapshot(`tasks-${theme}`);
    await page
      .getByRole("button", {
        name: "Edit task: A long reading and writing task for the afternoon",
        exact: true,
      })
      .click();
    await snapshot(`task-editor-${theme}`);
    await page
      .getByRole("button", { name: "Save task", exact: true })
      .scrollIntoViewIfNeeded();
    await snapshot(`task-goal-${theme}`);
    await page.getByRole("button", { name: "Back to tasks" }).click();
  }
  await navigate(page, "Timer");
  await command(page, { type: "start", minutes: 1 });
  await expire(worker, page);
  await snapshot("focus-complete");
  await page.getByRole("button", { name: "Take a break", exact: true }).click();
  await snapshot("break-timer");
  await page.getByRole("button", { name: "End break", exact: true }).click();
  await navigate(page, "Statistics");
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await page.locator(".subview").evaluate((element) => {
      element.scrollTop = 0;
    });
    await snapshot(`statistics-${theme}`);
    await page.getByRole("combobox", { name: "Graph range" }).selectOption("month");
    await snapshot(`statistics-month-${theme}`);
  }
  const blocked = await context.newPage();
  await blocked.goto(`chrome-extension://${id}/blocked.html`);
  await expect(blocked.locator(".blocked-panel")).toBeVisible();
  expect(
    (await blocked.locator(".blocked-panel").boundingBox()).width,
  ).toBeLessThanOrEqual(300);
  await blocked
    .locator(".blocked-panel")
    .screenshot({ path: testInfo.outputPath("blocked-ended-dark.png") });
});

test("restores a preference and explains a failed save", async ({ extension }) => {
  const { page, worker } = extension;
  await navigate(page, "Settings");
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (
        message.action?.type === "settings" &&
        message.action.settings.notifications === false
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return { error: "Unable to save this preference." };
      }
      return send(message);
    };
  });
  const toggle = page.getByRole("checkbox", { name: "Notifications", exact: true });
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText("Unable to save this preference.");
  await expect(toggle).toBeChecked();
  expect((await stored(worker)).settings.notifications).toBe(true);
});

test("restores idle state and explains when starting focus fails", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message.action?.type === "start") {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { error: "Unable to start focus." };
      }
      return send(message);
    };
  });
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await expect(page.locator(".task-context")).toHaveText("Task");
  await expect(page.getByText("Starting...", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Unable to start focus.");
  await expect(page.locator(".task-context")).toHaveText("Task");
  await expect(page.getByRole("button", { name: "Start 10 minute timer" })).toBeEnabled();
  await expect(page.locator(".timer-start")).toHaveAttribute("aria-busy", "false");
  expect(
    await page
      .locator(".timer-start")
      .evaluate((element) => getComputedStyle(element, "::after").backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  expect((await stored(worker)).timer.mode).toBe("idle");
});

test("tracks the pointer with interior light without moving the circle", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  const start = page.getByRole("button", { name: "Start 10 minute timer" });
  const bounds = await start.boundingBox();
  const light = () =>
    start.evaluate((element) => ({
      x: element.style.getPropertyValue("--timer-light-x"),
      y: element.style.getPropertyValue("--timer-light-y"),
      gradient: getComputedStyle(element, "::after").backgroundImage,
    }));
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await page.mouse.move(bounds.x + 40, bounds.y + 100);
    const left = await light();
    await page.mouse.move(bounds.x + 180, bounds.y + 150);
    const right = await light();
    expect(parseFloat(right.x)).toBeGreaterThan(parseFloat(left.x));
    expect(parseFloat(right.y)).toBeGreaterThan(parseFloat(left.y));
    expect(right.gradient).not.toBe(left.gradient);
    expect(await start.boundingBox()).toEqual(bounds);
    await page.screenshot({ path: testInfo.outputPath(`pointer-light-${theme}.png`) });
    await start.dispatchEvent("pointermove", {
      pointerType: "touch",
      clientX: 150,
      clientY: 150,
    });
    expect(await light()).toEqual(right);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(bounds.x + 50, bounds.y + 150);
    const reduced = await light();
    expect(reduced.x).toBe(right.x);
    expect(reduced.y).toBe(right.y);
    expect(reduced.gradient).toContain("50% 42%");
    await expect(start).toHaveCSS("transform", "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
});

test("starts from the time circle with keyboard and long durations", async ({
  extension,
}, testInfo) => {
  const { page } = extension;
  const start = page.getByRole("button", { name: "Start 10 minute timer" });
  await expect(page.locator(".timer-dial")).toHaveCount(0);
  const buttonSize = await start.boundingBox();
  expect(buttonSize.height).toBe(220);
  expect(buttonSize.width).toBe(220);
  expect(buttonSize.x + buttonSize.width / 2).toBe(150);
  const taskButton = page.getByRole("button", { name: /Select task/ });
  const taskBounds = await taskButton.boundingBox();
  expect(taskBounds.width).toBeLessThan(110);
  expect(taskBounds.height).toBe(28);
  await expect(page.locator(".start-eyebrow")).toHaveCount(0);
  const digitsBounds = await start.locator(".digits").boundingBox();
  const summaryBounds = await page.locator(".orbit-task-summary").boundingBox();
  expect(digitsBounds.y - taskBounds.y - taskBounds.height).toBeGreaterThanOrEqual(8);
  expect(summaryBounds.y - digitsBounds.y - digitsBounds.height).toBeGreaterThanOrEqual(
    16,
  );
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await page.mouse.move(299, 0);
    await start.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    expect(
      await start.evaluate((element) => getComputedStyle(element, "::after").opacity),
    ).toBe("0");
    const resting = await start.evaluate((element) => ({
      border: getComputedStyle(element).borderColor,
      background: getComputedStyle(element).backgroundImage,
    }));
    await start.hover();
    await expect(start).toHaveCSS("border-color", resting.border);
    await expect(start).toHaveCSS("background-image", resting.background);
    await expect
      .poll(() =>
        start.evaluate((element) => getComputedStyle(element, "::after").opacity),
      )
      .toBe("1");
    expect(
      await start.evaluate(
        (element) => getComputedStyle(element, "::after").backgroundImage,
      ),
    ).toContain("radial-gradient");
    await page.locator("main").screenshot({
      path: testInfo.outputPath(`timer-hover-${theme}.png`),
    });
    const beforePress = await start.evaluate(
      (element) => getComputedStyle(element, "::after").backgroundColor,
    );
    await page.mouse.down();
    await expect(start).toHaveCSS("border-color", resting.border);
    expect(
      await start.evaluate(
        (element) => getComputedStyle(element, "::after").backgroundColor,
      ),
    ).not.toBe(beforePress);
    expect(await start.boundingBox()).toEqual(buttonSize);
    await page
      .locator("main")
      .screenshot({ path: testInfo.outputPath(`timer-pressed-${theme}.png`) });
    await page.mouse.move(299, 0);
    await page.mouse.up();
    await expect
      .poll(() =>
        start.evaluate((element) => getComputedStyle(element, "::after").opacity),
      )
      .toBe("0");
  }
  await command(page, { type: "settings", settings: { theme: "light" } });
  await expect(start.locator("svg")).toHaveCount(0);
  await expect(start).toHaveAttribute("title", "Click to start focus");
  await expect(start.locator(".start-cue")).toHaveCount(0);
  await expect(taskButton.locator("svg")).toHaveCount(0);
  await expect(page.locator(".task-context")).toHaveText("Task");
  await expect(taskButton).toHaveAttribute("title", "Change task: General");
  await expect(taskButton.locator(".task-name")).toHaveCSS(
    "text-decoration-line",
    "none",
  );

  expect(taskBounds.x + taskBounds.width / 2).toBeCloseTo(
    buttonSize.x + buttonSize.width / 2,
    1,
  );
  const taskGroup = await taskButton.locator("strong").boundingBox();
  expect(taskGroup.x + taskGroup.width / 2).toBeCloseTo(150, 1);
  const taskName = await taskButton.locator(".task-name").boundingBox();
  expect(taskName.x + taskName.width / 2).toBeCloseTo(150, 1);
  expect(digitsBounds.x + digitsBounds.width / 2).toBeCloseTo(150, 1);
  expect(summaryBounds.x + summaryBounds.width / 2).toBeCloseTo(150, 1);
  expect(taskBounds.y).toBeGreaterThan(buttonSize.y);
  const radius = buttonSize.width / 2;
  for (const x of [taskBounds.x, taskBounds.x + taskBounds.width]) {
    for (const y of [taskBounds.y, taskBounds.y + taskBounds.height]) {
      expect(
        Math.hypot(x - buttonSize.x - radius, y - buttonSize.y - radius),
      ).toBeLessThan(radius);
    }
  }
  await taskButton.hover();
  await expect(taskButton).toHaveCSS("border-top-width", "1px");
  await expect(taskButton).toHaveCSS("border-radius", "8px");
  await expect(taskButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(
    await taskButton.evaluate((element) => getComputedStyle(element, "::before").content),
  ).toBe("none");
  await page
    .locator("main")
    .screenshot({ path: testInfo.outputPath("task-hover-inside-circle.png") });

  expect(
    await taskButton.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
      );
    }),
  ).toBe(true);
  expect(
    await taskButton.evaluate((element) => element.closest("button.timer-circle")),
  ).toBeNull();
  await taskButton.click();
  await page.getByRole("button", { name: "Manage tasks", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your Tasks", exact: true }),
  ).toBeVisible();
  await navigate(page, "Timer");
  const popupSize = await page.locator("main").boundingBox();
  expect(popupSize.width).toBe(300);
  expect(popupSize.height).toBe(340);
  expect(
    await page
      .locator(".screen-content")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await expect(start).toHaveCSS("border-radius", "50%");
  await expect(start.locator(".digits")).toHaveText("10:00");
  const before = await start.boundingBox();
  await start.hover();
  await expect(start).toHaveCSS("transform", "none");
  expect(await start.boundingBox()).toEqual(before);
  await page
    .locator("main")
    .screenshot({ path: testInfo.outputPath("focus-circle-light.png") });
  await page.getByLabel("Focus duration", { exact: true }).selectOption("180");
  const longStart = page.getByRole("button", { name: "Start 180 minute timer" });
  await expect(page.locator(".timer-ready .digits")).toHaveText("180:00");
  const digitsSize = await longStart.locator(".digits").boundingBox();
  const circleSize = await longStart.boundingBox();
  expect(digitsSize.x).toBeGreaterThan(circleSize.x + 12);
  expect(digitsSize.x + digitsSize.width).toBeLessThan(
    circleSize.x + circleSize.width - 12,
  );
  await page.screenshot({ path: testInfo.outputPath("focus-long-duration.png") });
  await longStart.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
  expect(await page.evaluate(() => chrome.action.getTitle({}))).toBe(
    "Flow: Focus running",
  );
  for (const size of [16, 32]) {
    expect(
      await page.evaluate(async (size) => {
        const image = new Image();
        image.src = chrome.runtime.getURL(`icons/running-${size}.png`);
        await image.decode();
        return image.naturalWidth;
      }, size),
    ).toBe(size);
  }
  expect((await page.locator("main").boundingBox()).height).toBe(340);
});

test("edits General details and goals while keeping the permanent identity and recorded time", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  await openTasks(page);
  await page.getByRole("button", { name: "Edit task: General", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archive task", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete task", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Task name", { exact: true }).fill("Everyday focus");
  await page.getByRole("checkbox", { name: "Set a daily goal", exact: true }).check();
  await page.getByLabel("Daily goal in minutes").fill("20");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Everyday focus/ })).toBeVisible();
  await page.getByRole("button", { name: /^Everyday focus/ }).click();
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    flow.timer.anchor = Date.now() - 5 * 60000;
    flow.timer.session.startedAt = flow.timer.anchor;
    await chrome.storage.local.set({ flow });
  });
  await command(page, { type: "tick" });
  const session = (await stored(worker)).timer.session.id;
  await expect(
    page.getByRole("progressbar", { name: "Daily goal progress" }),
  ).toHaveAttribute("aria-valuenow", "25");
  await page
    .locator("main")
    .screenshot({ path: testInfo.outputPath("general-goal.png") });
  await openTasks(page);
  await page
    .getByRole("button", { name: "Edit task: Everyday focus", exact: true })
    .click();
  await page.getByLabel("Daily goal in minutes").fill("40");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const data = await stored(worker);
  expect(data.tasks).toHaveLength(0);
  expect(data.goals).toHaveLength(1);
  expect(data.goals[0].taskId).toBeNull();
  expect(data.timer.session.id).toBe(session);
  expect(data.timer.session.taskId).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Select task. Everyday focus" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Daily goal progress" }),
  ).toHaveAttribute("aria-valuenow", "13");
});

test("fills the circle bottom to top for daily goals without moving the timer", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  const goal = { targetMinutes: 20, weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true };
  const data = await command(page, { type: "saveTask", name: "Reading", goal });
  const taskId = data.tasks[0].id;
  await openTasks(page);
  await page.getByRole("button", { name: /^Reading/ }).click();
  await expect(page.getByRole("button", { name: "Start 10 minute timer" })).toBeVisible();
  const before = await page.locator(".timer-circle").boundingBox();
  await expect(page.locator(".timer-orbit")).toHaveCSS("--goal-fill-height", "0%");
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    flow.timer.anchor = Date.now() - 5 * 60000;
    flow.timer.session.startedAt = flow.timer.anchor;
    await chrome.storage.local.set({ flow });
  });
  await command(page, { type: "tick" });
  await expect(
    page.getByRole("progressbar", { name: "Daily goal progress" }),
  ).toHaveAttribute("aria-valuenow", "25");
  await expect(page.locator(".task-ring")).toHaveCount(0);
  const fillHeight = () =>
    page
      .locator(".timer-circle")
      .evaluate((element) => parseFloat(getComputedStyle(element, "::before").height));
  await expect.poll(fillHeight).toBeGreaterThan(54);
  expect(await fillHeight()).toBeLessThan(56);
  await expect(page.locator(".timer-orbit")).toHaveClass(/has-goal/);
  const taskBounds = await page
    .getByRole("button", { name: "Select task. Reading" })
    .boundingBox();
  expect(taskBounds.y).toBeGreaterThan(before.y);
  expect(taskBounds.y + taskBounds.height).toBeLessThan(before.y + before.height);
  expect(taskBounds.x).toBeGreaterThan(before.x);
  expect(taskBounds.x + taskBounds.width).toBeLessThan(before.x + before.width);
  await page.getByRole("button", { name: "Select task. Reading" }).click();
  await page.getByRole("button", { name: "Manage tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Tasks" })).toBeVisible();
  await navigate(page, "Timer");
  expect(await page.locator(".timer-circle").boundingBox()).toEqual(before);
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await page
      .locator("main")
      .screenshot({ path: testInfo.outputPath(`task-ring-quarter-${theme}.png`) });
  }
  await command(page, {
    type: "saveTask",
    taskId,
    name: "Reading",
    goal: { ...goal, enabled: false },
  });
  await expect(page.locator(".timer-orbit")).not.toHaveClass(/has-goal/);
  await command(page, {
    type: "saveTask",
    taskId,
    name: "Reading",
    goal: { ...goal, targetMinutes: 1 },
  });
  await expect(page.locator(".timer-orbit")).toHaveCSS("--goal-fill-height", "100%");
  expect(await fillHeight()).toBe(218);
  for (const theme of ["light", "dark"]) {
    await command(page, { type: "settings", settings: { theme } });
    await page
      .locator("main")
      .screenshot({ path: testInfo.outputPath(`goal-full-${theme}.png`) });
    const contrast = await page.locator(".goal-progress").evaluate((element) => {
      const luminance = (color) => {
        const channels = color
          .match(/\d+/g)
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const text = luminance(getComputedStyle(element).color);
      const fill = luminance(
        getComputedStyle(document.querySelector(".timer-circle"), "::before")
          .backgroundColor,
      );
      return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  const weekday = await page.evaluate(() => new Date().getDay());
  await command(page, {
    type: "saveTask",
    taskId,
    name: "Reading",
    goal: { ...goal, weekdays: [(weekday + 1) % 7] },
  });
  await expect(page.locator(".timer-orbit")).not.toHaveClass(/has-goal/);
  expect(await page.locator(".timer-circle").boundingBox()).toEqual(before);
});

test("enables keep counting during focus and records overtime until explicitly ended", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await navigate(page, "Settings");
  const preference = page.getByRole("checkbox", { name: "Keep counting after target" });
  await expect(preference).not.toBeChecked();
  await preference.check();
  await expect.poll(async () => (await stored(worker)).settings.keepCounting).toBe(true);
  await page.reload();
  await navigate(page, "Settings");
  await expect(
    page.getByRole("checkbox", { name: "Keep counting after target" }),
  ).toBeChecked();
  await navigate(page, "Timer");
  await expire(worker, page);
  const readout = page.getByRole("timer", { name: "Total focus time, counting up" });
  await expect(readout).toBeVisible();
  await expect(page.getByText("STILL IN FLOW", { exact: true })).toBeVisible();
  const first = await readout.textContent();
  await expect.poll(() => readout.textContent()).not.toBe(first);
  expect((await stored(worker)).timer.completedAt).toBeUndefined();
  await page.getByRole("button", { name: "End focus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start 10 minute timer" })).toBeVisible();
  const data = await stored(worker);
  expect(data.history).toHaveLength(1);
  expect(data.history[0].focusMs).toBeGreaterThan(10 * 60000);
});

test("plays actual offscreen audio with the popup closed during full screen", async ({
  extension,
}) => {
  const { page, worker, context } = extension;
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Test completion sound" }).click();
  await expect(page.getByRole("status")).toContainText("Chime played");
  await command(page, {
    type: "settings",
    settings: { notifications: false, sound: true },
  });
  await navigate(page, "Timer");
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await worker.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    globalThis.flowPlayed = 0;
    chrome.runtime.sendMessage = async (...args) => {
      const result = await send(...args);
      if (args[0]?.target === "flow-audio" && result?.played) globalThis.flowPlayed++;
      return result;
    };
  });
  const videoPage = await context.newPage();
  await videoPage.setContent(
    '<button onclick="document.documentElement.requestFullscreen()">Watch full screen</button>',
  );
  await videoPage.getByRole("button", { name: "Watch full screen" }).click();
  await expect
    .poll(() => videoPage.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.close();
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    const delta = flow.timer.session.targetMs + 1000;
    flow.timer.anchor -= delta;
    flow.timer.session.startedAt -= delta;
    await chrome.storage.local.set({ flow });
    await chrome.alarms.create("flow-target", { when: Date.now() + 100 });
  });
  await expect
    .poll(() => worker.evaluate(() => globalThis.flowPlayed), { timeout: 15000 })
    .toBe(1);
  expect((await stored(worker)).timer.anchor).toBeNull();
  expect(await videoPage.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await worker.evaluate(async () => {
    await chrome.alarms.create("flow-target", { when: Date.now() + 100 });
  });
  await expect.poll(async () => (await stored(worker)).timer.notified).toBe(true);
  expect(await worker.evaluate(() => globalThis.flowPlayed)).toBe(1);
});

test("loads the real extension and persists a single-button home preference", async ({
  extension,
}, testInfo) => {
  const { page, worker, context, id } = extension;
  await expect(page.getByRole("button", { name: "Start 10 minute timer" })).toBeVisible();
  await expect(page.locator(".timer-start svg")).toHaveCount(0);
  const menu = page.locator(".app-menu");
  await expect(menu).not.toHaveAttribute("open");
  await page.screenshot({ path: testInfo.outputPath("home-minimal.png") });
  await page.getByText("Menu", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Statistics", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  await expect(page.locator(".app-menu summary")).toBeFocused();
  await page.getByText("Menu", { exact: true }).click();
  await page.locator(".brand").click();
  await expect(menu).not.toHaveAttribute("open");
  await openTasks(page);
  await expect(page.getByRole("button", { name: /^General/ })).toBeVisible();
  await expect(page.getByText("Choose where your time goes.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit task: General", exact: true }),
  ).toBeVisible();
  await navigate(page, "Timer");
  await navigate(page, "Tasks");
  await expect(menu).not.toHaveAttribute("open");
  await expect(page.locator("header .brand")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Your Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".back-home, .back")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("tasks-navigation.png") });
  await navigate(page, "Settings");
  await expect(
    page.getByRole("heading", { name: "Your Flow", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings-navigation.png") });
  const version = await page.evaluate(() => chrome.runtime.getManifest().version);
  await expect(page.locator(".privacy")).toContainText(`Flow · Version ${version}`);
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
  await navigate(page, "Timer");
  await expect(page.getByRole("button", { name: "Start 20 minute timer" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Focus duration" })).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(
    reopened.getByRole("button", { name: "Start 20 minute timer" }),
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
  await page.getByRole("button", { name: "Start 2 minute timer" }).click();
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
  await expect(page.getByRole("list", { name: "Tasks", exact: true })).toBeVisible();
  const editTarget = await page
    .getByRole("button", { name: "Edit task: Reading", exact: true })
    .boundingBox();
  expect(editTarget.width).toBeGreaterThanOrEqual(44);
  expect(editTarget.height).toBeGreaterThanOrEqual(44);
  const firstCardBounds = await page.locator(".task-list-item").nth(0).boundingBox();
  const secondCardBounds = await page.locator(".task-list-item").nth(1).boundingBox();
  expect(
    secondCardBounds.x - firstCardBounds.x - firstCardBounds.width,
  ).toBeGreaterThanOrEqual(10);
  expect(Math.abs(firstCardBounds.height - firstCardBounds.width)).toBeLessThan(12);
  const firstTime = await page.locator(".task-time").nth(0).boundingBox();
  const secondTime = await page.locator(".task-time").nth(1).boundingBox();
  expect(firstTime.y).toBeCloseTo(secondTime.y, 1);
  await expect(page.locator(".task-list-item").first()).toHaveCSS(
    "backdrop-filter",
    /blur\(12px\)/,
  );
  const selectedCard = page.locator(".task-list-item.is-selected");
  await expect(selectedCard).toContainText("Reading");
  await expect(
    selectedCard.getByRole("progressbar", { name: "Daily goal progress" }),
  ).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("tasks.png") });
  await select(page, "Coding");
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch and continue" })).toHaveCount(0);
  expect((await stored(worker)).timer.session.taskId).toBe(
    (await stored(worker)).tasks.find((task) => task.name === "Coding").id,
  );
  expect((await stored(worker)).timer.session.id).toBe(session);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(reopened.getByRole("timer")).toBeVisible();
  expect((await stored(worker)).timer.session.id).toBe(session);
  await expire(worker, reopened);
  await expect(reopened.getByRole("img", { name: "Daily goal reached" })).toBeVisible();
  await expect(reopened.getByText("FOCUS COMPLETE", { exact: true })).toBeVisible();
  expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
  expect(await worker.evaluate(() => chrome.action.getTitle({}))).toBe(
    "Flow: Focus complete",
  );
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
    reopened.getByRole("button", { name: "Start 10 minute timer" }),
  ).toBeVisible();
  expect((await stored(worker)).history).toHaveLength(2);
  await navigate(reopened, "Statistics");
  await expect(reopened.getByRole("heading", { name: "Focus by task" })).toBeVisible();
  await expect(reopened.getByText("Menu", { exact: true })).toBeVisible();
});

test("edits recurring goals, archives and restores tasks, and keeps General available", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await task(page, "Reading", 120);
  await page.getByRole("button", { name: "Edit task: Reading", exact: true }).click();
  await page.getByLabel("Task name", { exact: true }).fill("Books");
  await page.getByLabel("Set a daily goal").uncheck();
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
  await navigate(page, "Timer");
  await openTasks(page);
  await select(page, "General");
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  expect((await stored(worker)).timer.session.taskId).toBeNull();
});

test("returns home without adding focus time when the completion window expires", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
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
  await expect(page.getByRole("button", { name: "Start 10 minute timer" })).toBeVisible();
  const saved = await stored(worker);
  expect(saved.history).toHaveLength(1);
  expect(saved.history[0].focusMs).toBe(600000);
  expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
  expect(await worker.evaluate(() => chrome.action.getTitle({}))).toBe(
    "Flow: Focus complete",
  );
  expect(
    await worker.evaluate(
      async () => (await chrome.storage.local.get("flowCompletion")).flowCompletion,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start 10 minute timer" })).toBeVisible();
  await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
  expect((await stored(worker)).history).toHaveLength(1);
});

test("deletes a task with confirmation and retains the permanent default", async ({
  extension,
}) => {
  const { page, worker } = extension;
  await task(page, "Reading");
  await select(page, "Reading");
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  const sessionId = (await stored(worker)).timer.session.id;
  await openTasks(page);
  await expect(
    page.getByRole("button", { name: "Delete task", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit task: Reading", exact: true }).click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Delete Reading?" });
  await expect(confirmation).toContainText("continue as General");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await stored(worker)).tasks).toHaveLength(1);
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Reading/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^General/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const data = await stored(worker);
  expect(data.tasks).toHaveLength(0);
  expect(data.goals).toHaveLength(0);
  expect(data.timer.session.id).toBe(sessionId);
  expect(data.timer.session.taskId).toBeNull();
  await page.getByRole("button", { name: "Archived tasks", exact: true }).click();
  await expect(page.getByRole("button", { name: /^General/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit task: General", exact: true }),
  ).toBeVisible();
});

test("hides the home task selector without losing task selection or tracking", async ({
  extension,
}, testInfo) => {
  const { page, worker, context, id } = extension;
  await task(page, "Reading");
  await select(page, "Reading");
  const taskId = (await stored(worker)).selectedTaskId;
  await navigate(page, "Settings");
  const toggle = page.getByLabel("Show task on home", { exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect.poll(async () => (await stored(worker)).settings.showTask).toBe(false);
  await navigate(page, "Timer");
  await expect(page.getByRole("button", { name: /Select task/ })).toHaveCount(0);
  const expanded = await page.locator(".timer-circle").boundingBox();
  expect(expanded.width).toBe(220);
  expect(expanded.height).toBe(220);
  expect((await page.locator("main").boundingBox()).height).toBe(340);
  await page
    .locator("main")
    .screenshot({ path: testInfo.outputPath("expanded-timer.png") });
  await expect(
    page.getByRole("progressbar", { name: "Daily goal progress" }),
  ).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(
    reopened.getByRole("button", { name: "Start 10 minute timer" }),
  ).toBeVisible();
  await expect(reopened.getByRole("button", { name: /Select task/ })).toHaveCount(0);
  expect((await reopened.locator(".timer-circle").boundingBox()).width).toBe(220);
  await reopened.getByRole("button", { name: "Start 10 minute timer" }).click();
  expect((await reopened.locator(".timer-circle").boundingBox()).width).toBe(220);
  expect((await stored(worker)).timer.session.taskId).toBe(taskId);
  await navigate(reopened, "Tasks");
  await expect(reopened.getByRole("button", { name: /^Reading/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await navigate(reopened, "Settings");
  await reopened.getByLabel("Show task on home", { exact: true }).click();
  await expect(reopened.getByLabel("Show task on home", { exact: true })).toBeChecked();
  await navigate(reopened, "Timer");
  await expect(
    reopened.getByRole("button", { name: /Select task.*Reading/ }),
  ).toBeVisible();
  expect((await reopened.locator(".timer-circle").boundingBox()).width).toBe(220);
});

test("liquid background settles, respects reduced motion, and leaves controls clickable", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  // Keep settings saves asynchronous even when the local worker responds quickly.
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message.action?.type === "settings")
        await new Promise((resolve) => setTimeout(resolve, 200));
      return send(message);
    };
  });
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
  await expect.poll(paintedPixels).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(wake).toBeHidden();
  // CSS hides the canvas before the media-query change event clears its pixels.
  await expect.poll(paintedPixels).toBe(0);
  await expect(timerSurface).toHaveCSS("translate", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await navigate(page, "Settings");
  const effect = page.getByRole("checkbox", { name: "Liquid surface effect" });
  await expect(effect).toBeChecked();
  await effect.click();
  await expect(effect).not.toBeChecked();
  await expect.poll(async () => (await stored(worker)).settings.liquidEffect).toBe(false);
  await expect(wake).toHaveCount(0);
  await page.reload();
  await navigate(page, "Settings");
  await expect(
    page.getByRole("checkbox", { name: "Liquid surface effect" }),
  ).not.toBeChecked();
  await expect(wake).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Liquid surface effect" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Liquid surface effect" }),
  ).toBeChecked();
  await expect.poll(async () => (await stored(worker)).settings.liquidEffect).toBe(true);
  await expect(wake).toBeVisible();
  await navigate(page, "Timer");
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
});

test("keeps the same circle and position when focus starts, with no tracking bar", async ({
  extension,
}, testInfo) => {
  const { page, worker } = extension;
  const circleBefore = await page.locator(".timer-circle").boundingBox();
  await expect(page.locator(".task-context")).toHaveText("Task");
  await expect(page.locator(".task-context")).toHaveCSS("position", "relative");
  await expect(page.locator(".task-context")).toHaveCSS("z-index", "2");
  await expect(page.locator(".task-context")).toHaveCSS("pointer-events", "none");
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message.action?.type === "start") {
        await new Promise((resolve) => {
          globalThis.releaseFocusStart = resolve;
        });
      }
      return send(message);
    };
  });
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await expect(page.locator(".task-context")).toHaveText("Task");
  await expect(page.getByText("Starting...", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start 10 minute timer" }),
  ).toBeDisabled();
  expect(await page.locator(".timer-circle").boundingBox()).toEqual(circleBefore);
  await expect(page.locator(".timer-start")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".timer-start")).toHaveCSS("opacity", "1");
  expect(
    await page
      .locator(".timer-start")
      .evaluate((element) => getComputedStyle(element, "::after").backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => globalThis.releaseFocusStart());
  await expect(page.locator(".task-context")).toHaveText("FOCUSING");
  expect(await worker.evaluate(() => chrome.action.getTitle({}))).toBe(
    "Flow: Focus running",
  );
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
  expect(await page.locator(".timer-circle").boundingBox()).toEqual(circleBefore);
  const runningDigits = await page.getByRole("timer").boundingBox();
  expect(runningDigits.x + runningDigits.width / 2).toBeCloseTo(150, 1);
  await expect(page.locator(".screen-content")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("timer")).toHaveCSS("animation-name", "none");
  await expect(
    page.getByRole("progressbar", { name: "Focus target progress" }),
  ).toHaveCount(0);
  await expect(page.locator(".focus-countdown, .focus-dial")).toHaveCount(0);
  await expect(page.locator("button.timer-circle, .timer-circle button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Select task/ })).toBeVisible();
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    flow.timer.anchor -= 120000;
    flow.timer.session.startedAt -= 120000;
    await chrome.storage.local.set({ flow });
  });
  await command(page, { type: "tick" });
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toHaveText(
    "08:00",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("focus-countdown.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator(".screen-content")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("timer")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".timer-running")).toHaveCSS("border-radius", "50%");
  await expect(page.locator(".timer-running")).toHaveCSS("transform", "none");
  await expect(page.getByRole("timer", { name: "Focus time remaining" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("focus-countdown-dark.png") });
});

test("keeps scrollable screens usable and explains task icons", async ({ extension }) => {
  const { page } = extension;
  for (const name of ["Settings", "Statistics"]) {
    await page.getByText("Menu", { exact: true }).click();
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
  await navigate(page, "Timer");
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
  await navigate(page, "Statistics");
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
  await page.getByRole("heading", { name: "Your Focus" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("statistics.png"), fullPage: true });
});
