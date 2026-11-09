import { remaining, type Data } from "./domain.js";
import { installFocusOverlay } from "./overlay.js";

export function shouldBlock(data: Data, value?: string): boolean {
  if (
    !data.settings.blocking ||
    data.timer.mode !== "focus" ||
    data.timer.paused ||
    remaining(data.timer, Date.now()) <= 0 ||
    !value
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      data.settings.sites.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

export async function blockOpenTab(data: Data, id: number) {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(id);
  } catch {
    return;
  } // A tab can close after the query.
  // Re-read the URL so a tab that has navigated away is left alone.
  if (!shouldBlock(data, tab.pendingUrl ?? tab.url)) return;
  await chrome.scripting.executeScript({
    target: { tabId: id },
    func: installFocusOverlay,
  });
}

export async function blockOpenTabs(data: Data) {
  if (
    !data.settings.blocking ||
    data.timer.mode !== "focus" ||
    data.timer.paused ||
    remaining(data.timer, Date.now()) <= 0 ||
    !data.settings.sites.length
  )
    return;
  const tabs = await chrome.tabs.query({});
  const results = await Promise.allSettled(
    tabs
      .filter(
        (tab) => tab.id !== undefined && shouldBlock(data, tab.pendingUrl ?? tab.url),
      )
      .map((tab) => blockOpenTab(data, tab.id!)),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length)
    throw new Error(
      `Unable to show the focus warning in ${failed.length} open tab(s). Check Flow's site access in Chrome and reopen Flow to retry.`,
    );
}
