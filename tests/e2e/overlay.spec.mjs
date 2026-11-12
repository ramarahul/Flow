import { test, expect, chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

test("locks document and nested scrolling while the warning is open, then restores the page", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 700 },
      hasTouch: true,
    });
    await page.route("https://overlay.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<style>html{overflow-y:scroll}body{margin:0;height:4000px}#feed{position:fixed;left:0;top:0;width:200px;height:500px;overflow:auto}#posts{height:5000px}button{position:fixed;left:10px;top:10px}</style><div id="feed"><div id="posts">A long feed</div></div><button onclick="window.pageClicks++">Page action</button>`,
      }),
    );
    await page.goto("https://overlay.test/");
    await page.evaluate(() => {
      window.pageClicks = 0;
      window.scrollTo(0, 250);
      document.querySelector("#feed").scrollTop = 100;
      document.documentElement.style.setProperty("overflow-y", "scroll", "important");
      const showModal = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        window.warning = this;
        return showModal.call(this);
      };
      Object.defineProperty(window, "chrome", {
        configurable: true,
        value: {
          storage: {
            local: {
              get: async () => ({
                flow: {
                  settings: { blocking: true, sites: ["overlay.test"] },
                  timer: {
                    mode: "focus",
                    paused: false,
                    anchor: Date.now(),
                    session: { focusMs: 0, targetMs: 600000 },
                  },
                },
              }),
            },
            onChanged: { addListener() {}, removeListener() {} },
          },
          runtime: { sendMessage: async () => ({}) },
        },
      });
    });
    const { code: source } = await transformWithOxc(
      await readFile(new URL("../../src/overlay.ts", import.meta.url), "utf8"),
      "overlay.ts",
      { target: "es2022" },
    );
    await page.addScriptTag({
      type: "module",
      content: `${source}\nawait installFocusOverlay(); window.overlayReady = true;`,
    });
    await page.waitForFunction(() => window.overlayReady);
    const positions = () =>
      page.evaluate(() => [window.scrollY, document.querySelector("#feed").scrollTop]);
    const original = await positions();
    await page.mouse.move(50, 100);
    await page.mouse.wheel(0, 600);
    await page.keyboard.press("PageDown");
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await page.mouse.click(20, 20);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(await positions()).toEqual(original);
    expect(await page.evaluate(() => window.pageClicks)).toBe(0);
    expect(await page.evaluate(() => window.warning.open)).toBe(true);
    // Check cancellation directly as well as native wheel behavior.
    expect(
      await page.evaluate(() =>
        window.dispatchEvent(
          new TouchEvent("touchmove", {
            cancelable: true,
            touches: [
              new Touch({
                identifier: 1,
                target: document.body,
                clientX: 20,
                clientY: 20,
              }),
            ],
          }),
        ),
      ),
    ).toBe(false);
    await page.setViewportSize({ width: 300, height: 320 });
    await page.mouse.move(150, 160);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => window.warning.scrollTop))
      .toBeGreaterThan(0);
    expect(await positions()).toEqual(original);
    const button = await page.evaluate(() => {
      const rect = window.warning.querySelector("button").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(button.x, button.y);
    await expect.poll(() => page.evaluate(() => window.warning.open)).toBe(false);
    expect(
      await page.evaluate(() => [
        document.documentElement.style.getPropertyValue("overflow-y"),
        document.documentElement.style.getPropertyPriority("overflow-y"),
        document.body.style.getPropertyValue("overflow-y"),
      ]),
    ).toEqual(["scroll", "important", ""]);
    await page.mouse.move(50, 100);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => page.evaluate(() => document.querySelector("#feed").scrollTop))
      .toBeGreaterThan(original[1]);
  } finally {
    await browser.close();
  }
});
