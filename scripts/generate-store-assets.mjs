import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Capture the real built extension in a disposable profile, never a user's data.
const output = resolve("screenshots");
const captures = resolve(".output/store-captures");
await mkdir(output, { recursive: true });
await mkdir(captures, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "flow-store-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 300, height: 650 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  reducedMotion: "reduce",
  args: [
    `--disable-extensions-except=${resolve("dist")}`,
    `--load-extension=${resolve("dist")}`,
  ],
});

const pngData = (bytes) => `data:image/png;base64,${bytes.toString("base64")}`;
const now = Date.now();
try {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = worker.url().split("/")[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole("button", { name: "Start 10 minute timer" }).waitFor();
  const data = await worker.evaluate(
    async () => (await chrome.storage.local.get("flow")).flow,
  );
  data.settings = {
    ...data.settings,
    theme: "light",
    liquidEffect: false,
    notifications: false,
  };
  data.tasks = [
    { id: "writing", name: "Writing", archived: false },
    { id: "reading", name: "Reading", archived: false },
  ];
  data.goals = data.tasks.map((task) => ({
    id: `goal-${task.id}`,
    taskId: task.id,
    targetMinutes: task.id === "writing" ? 60 : 30,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
  }));
  data.selectedTaskId = "writing";
  // Illustrative local records, not real user activity.
  data.history = [];
  for (let day = 6; day >= 0; day--) {
    for (const [index, taskId] of ["writing", "reading"].entries()) {
      const start = new Date(now);
      start.setDate(start.getDate() - day);
      start.setHours(index ? 9 : 8, 0, 0, 0);
      const minutes = index
        ? [10, 20, 15, 25, 20, 15, 10][day]
        : [30, 45, 25, 40, 50, 30, 20][day];
      const end = +start + minutes * 60000;
      // Keep today's sample sessions in the past even when generated early.
      if (end > now) continue;
      data.history.push({
        id: `${day}-${taskId}`,
        startedAt: +start,
        endedAt: end,
        outcome: "finished",
        targetMs: minutes * 60000,
        plannedMs: minutes * 60000,
        focusMs: minutes * 60000,
        breakMs: 0,
        taskId,
        segments: [{ start: +start, end, kind: "focus", taskId }],
      });
    }
  }
  const idle = structuredClone(data.timer);
  const seed = async () => {
    await worker.evaluate(async (flow) => chrome.storage.local.set({ flow }), data);
    await page.goto(`chrome-extension://${id}/index.html`);
    await page.getByRole("button", { name: "Start 10 minute timer" }).waitFor();
  };
  const navigate = async (name) => {
    await page.getByText("Menu", { exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
  };
  const capture = async (name, selector = "main") => {
    await page.mouse.move(299, 649);
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.locator(selector).screenshot({ animations: "disabled" });
    await writeFile(join(captures, `${name}.png`), bytes);
    return bytes;
  };
  await seed();
  const home = await capture("home");
  await navigate("Tasks");
  const tasks = await capture("tasks");
  await navigate("Statistics");
  const stats = await capture("statistics");
  await navigate("Timer");
  await page.getByRole("button", { name: "Start 10 minute timer" }).click();
  await worker.evaluate(async () => {
    const { flow } = await chrome.storage.local.get("flow");
    flow.timer.anchor -= 148000;
    flow.timer.session.startedAt -= 148000;
    await chrome.storage.local.set({ flow });
  });
  await expect(page.getByRole("timer")).toHaveText(/07:[0-5]\d/);
  await expect(page.locator(".timer-caption")).toContainText(/02:[0-5]\d focused/);
  const focus = await capture("focus");
  await page.setViewportSize({ width: 700, height: 700 });
  await page.goto(`chrome-extension://${id}/blocked.html`);
  await page.getByRole("button", { name: "End session and save partial time" }).waitFor();
  const blocked = await capture("blocking", ".blocked");
  // End the temporary session before disposing of the profile.
  data.timer = idle;
  await worker.evaluate(async (flow) => chrome.storage.local.set({ flow }), data);

  const render = await context.newPage();
  const style = `*{box-sizing:border-box}body{margin:0;background:#fffefa;color:#3b2e56;font-family:'Segoe UI',Arial,sans-serif}.canvas{position:relative;width:1280px;height:800px;overflow:hidden;background:linear-gradient(115deg,#fffefa 48%,#eee7fa 48%)}.copy{position:absolute;left:80px;top:80px;width:480px}.brand{font-size:42px;font-weight:700;letter-spacing:-2px}.brand b{color:#7052b5}.eyebrow{margin-top:100px;font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#7052b5;font-weight:600}h1{font-size:62px;line-height:1.07;letter-spacing:-2.6px;font-weight:600;margin:24px 0}p{font-size:22px;line-height:1.5;color:#65587d;max-width:430px;margin:0}.number{position:absolute;left:80px;bottom:52px;font-size:13px;letter-spacing:2px;color:#65587d}.product{position:absolute;left:682px;top:65px;width:480px;height:670px;display:flex;align-items:center;justify-content:center}.product img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:24px;box-shadow:0 18px 55px #49375f20}.foot{position:absolute;left:80px;bottom:80px;font-size:14px;color:#65587d}`;
  const slides = [
    [
      "01-start-timer",
      "Make room for focus",
      "Find your flow.<br>One click away.",
      "Pick your time. Start the timer.<br>Give your attention some space.",
      home,
    ],
    [
      "02-focus-session",
      "A quieter way to work",
      "One thing.<br>Your full attention.",
      "A clear countdown keeps you grounded.<br>Your timer keeps running when you close the popup.",
      focus,
    ],
    [
      "03-tasks-and-daily-goals",
      "Time for what matters",
      "A little time.<br>For each task.",
      "Choose what to work on.<br>Set daily goals that fit your week.",
      tasks,
    ],
    [
      "04-focus-statistics",
      "Look back with clarity",
      "See your time<br>in flow.",
      "Explore your days, weeks, months, and years. Keep your focus history on your device.",
      stats,
    ],
    [
      "05-website-blocking",
      "Fewer distractions",
      "Let the rest<br>wait a while.",
      "Block distracting websites during focus.<br>You choose which sites to block.",
      blocked,
    ],
  ];
  // The composition uses 2x captures, downsampled rather than enlarged.
  await render.setViewportSize({ width: 1280, height: 800 });
  for (const [index, [name, eyebrow, title, copy, bytes]] of slides.entries()) {
    await render.setContent(
      `<style>${style}</style><div class="canvas"><div class="copy"><div class="brand">flow<b>.</b></div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div><div class="product"><img src="${pngData(bytes)}"></div><div class="number">0${index + 1} / 05</div></div>`,
    );
    await render.locator("img").evaluate((img) => img.decode());
    const file = join(output, `flow-${name}-1280x800.png`);
    await render.screenshot({ path: file, scale: "css" });
    await verifyPng(file, 1280, 800);
  }

  const svg = (width, height, small) => {
    const title = small
      ? "Find your flow."
      : "Find your flow. Make time for what matters.";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
<defs><linearGradient id="bg"><stop stop-color="#eee7fa"/><stop offset="1" stop-color="#fffefa"/></linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<g font-family="Segoe UI, Arial, sans-serif" fill="#3b2e56">
<text x="${small ? 32 : 90}" y="${small ? 62 : 124}" font-size="${small ? 38 : 64}" font-weight="700" letter-spacing="-2">flow<tspan fill="#7052b5">.</tspan></text>
<text x="${small ? 32 : 90}" y="${small ? 135 : 265}" font-size="${small ? 40 : 78}" font-weight="600" letter-spacing="-2">Find your flow.</text>
<text x="${small ? 34 : 94}" y="${small ? 174 : 320}" font-size="${small ? 17 : 28}" fill="#65587d">${small ? "A little time. Your full attention." : "Make time for what matters."}</text>
<text x="${small ? 34 : 94}" y="${small ? 239 : 448}" font-size="${small ? 12 : 18}" fill="#7052b5">${small ? "FOCUS TIMER FOR CHROME" : "FOCUS TIMER  /  TASKS  /  WEBSITE BLOCKING"}</text>
${small ? "" : `<image href="${pngData(home)}" x="940" y="65" width="370" height="430" preserveAspectRatio="xMidYMid meet"/>`}
</g></svg>`;
  };
  // Promo art is editable vector typography; PNG exports are the upload files.
  const browser = await chromium.launch({ headless: true });
  try {
    const promo = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [name, width, height, small] of [
      ["flow-small-promo-440x280", 440, 280, true],
      ["flow-marquee-promo-1400x560", 1400, 560, false],
    ]) {
      const source = svg(width, height, small);
      await writeFile(join(output, `${name}.svg`), source);
      await promo.setViewportSize({ width, height });
      await promo.setContent(
        `<style>body{margin:0;background:#fffefa}svg{display:block}</style>${source}`,
      );
      await promo.screenshot({ path: join(output, `${name}.png`) });
      await verifyPng(join(output, `${name}.png`), width, height);
    }
  } finally {
    await browser.close();
  }
  console.log(
    "Created 5 screenshots and 2 promo tiles, with editable promo SVG sources.",
  );
} finally {
  await context.close();
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
  assert(basename(profile).startsWith("flow-store-"));
  await rm(profile, { recursive: true, force: true });
}

async function verifyPng(file, width, height) {
  const bytes = await readFile(file);
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
  assert.equal(bytes[24], 8, "PNG must use 8 bits per channel");
  assert.equal(bytes[25], 2, "PNG must be 24-bit RGB without alpha");
  console.log(`${basename(file)}: ${width}x${height}, RGB, no alpha`);
}
