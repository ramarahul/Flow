// Chrome serializes this function for the isolated content-script world.
// Keep every dependency inside the function; never access the page's scripts.
export async function installFocusOverlay() {
  const scope = globalThis as typeof globalThis & {
    __flowOverlayInstalled?: boolean;
  };
  if (scope.__flowOverlayInstalled) return;
  scope.__flowOverlayInstalled = true;
  let host: HTMLElement | null = null;
  let dialog: HTMLDialogElement | null = null;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseScrollLock: (() => void) | undefined;
  type OverlayData = {
    timer: {
      mode: string;
      paused: boolean;
      anchor: number | null;
      session: { focusMs: number; targetMs: number } | null;
    };
    settings: { blocking: boolean; sites: string[]; theme?: string };
  };
  let latest: OverlayData | undefined;
  const hide = () => {
    dialog?.close();
    host?.remove();
    releaseScrollLock?.();
    releaseScrollLock = undefined;
    host = null;
    dialog = null;
  };
  const lockPage = () => {
    const saved: {
      style: CSSStyleDeclaration;
      name: string;
      value: string;
      priority: string;
      locked: string;
    }[] = [];
    for (const element of [document.documentElement, document.body]) {
      if (!element) continue;
      for (const [name, locked] of [
        ["overflow-x", "hidden"],
        ["overflow-y", "hidden"],
        ["overscroll-behavior-x", "none"],
        ["overscroll-behavior-y", "none"],
      ]) {
        saved.push({
          style: element.style,
          name,
          value: element.style.getPropertyValue(name),
          priority: element.style.getPropertyPriority(name),
          locked,
        });
        element.style.setProperty(name, locked, "important");
      }
    }
    const blockScroll = (event: WheelEvent | TouchEvent) => {
      if (!dialog || !host) return;
      const point = "touches" in event ? event.touches[0] : event;
      const rect = dialog.getBoundingClientRect();
      const inside =
        point &&
        point.clientX >= rect.left &&
        point.clientX <= rect.right &&
        point.clientY >= rect.top &&
        point.clientY <= rect.bottom;
      // Only the warning may scroll. Never chain a gesture into the website.
      if (!inside && event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blockKeys = (event: KeyboardEvent) => {
      if (!host) return;
      if (!event.composedPath().includes(host) && event.cancelable)
        event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("wheel", blockScroll, { capture: true, passive: false });
    window.addEventListener("touchmove", blockScroll, { capture: true, passive: false });
    window.addEventListener("keydown", blockKeys, true);
    releaseScrollLock = () => {
      window.removeEventListener("wheel", blockScroll, true);
      window.removeEventListener("touchmove", blockScroll, true);
      window.removeEventListener("keydown", blockKeys, true);
      for (const { style, name, value, priority, locked } of saved) {
        if (
          style.getPropertyValue(name) !== locked ||
          style.getPropertyPriority(name) !== "important"
        )
          continue;
        if (value) style.setProperty(name, value, priority);
        else style.removeProperty(name);
      }
    };
  };
  const update = (data: OverlayData) => {
    latest = data;
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    const t = data.timer;
    const left = t.session
      ? t.session.targetMs -
        t.session.focusMs -
        (t.anchor === null ? 0 : Math.max(0, Date.now() - t.anchor))
      : 0;
    const blocked =
      data.settings.blocking &&
      data.timer.mode === "focus" &&
      !data.timer.paused &&
      left > 0 &&
      data.settings.sites.some(
        (domain) =>
          location.hostname === domain || location.hostname.endsWith(`.${domain}`),
      );
    if (!blocked) {
      hide();
      return;
    }
    // A single local deadline also clears the warning if the worker's alarm is
    // delayed. Visibility/wake checks correct throttled timers and clock changes.
    deadlineTimer = setTimeout(() => update(data), Math.min(left, 2147483647));
    if (host?.isConnected) {
      dialog?.setAttribute("data-theme", data.settings.theme ?? "system");
      return;
    }
    host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = new CSSStyleSheet();
    style.replaceSync(
      `
      :host {
        all: initial
      }
      dialog {
        --panel: #fffefa;
        --ink: #3b2e56;
        --muted: #65587d;
        --line: #c5b5e1;
        --action: #ffd6b1;
        --action-ink: #49345d;
        --danger: #a13d5d;
        box-sizing: border-box;
        position: fixed;
        inset: 0;
        margin: auto;
        width: min(300px,calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        overscroll-behavior: contain;
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        color: var(--ink);
        font: 12px/1.6 "Trebuchet MS","Segoe UI",Arial,sans-serif;
        text-align: center;
        box-shadow: none
      }
      dialog::backdrop {
        /* Opacity only: keep the website sharp and avoid visual distortion. */
        background: rgba(0,0,0,.45)
      }
      h1 {
        font-size: 24px;
        font-weight: 500;
        letter-spacing: -.6px;
        line-height: 1.25;
        margin: 16px 0 12px
      }
      p {
        margin: 12px 0;
        color: var(--muted)
      }
      .brand {
        font-size: 22px;
        letter-spacing: -1px;
        color: var(--ink)
      }
      button {
        display: block;
        width: 100%;
        margin-top: 16px;
        padding: 10px;
        border: 0;
        border-radius: 10px;
        background: var(--action);
        color: var(--action-ink);
        font: 500 11px "Trebuchet MS","Segoe UI",Arial,sans-serif;
        cursor: pointer
      }
      button:focus-visible {
        outline: 2px solid var(--ink);
        outline-offset: 4px
      }
      button:disabled {
        opacity: .6;
        cursor: wait
      }
      .note {
        font-size: 11px
      }
      .error {
        color: var(--danger)
      }
      dialog[data-theme="dark"] {
        --panel: #453657; --ink: #f7efff; --muted: #d2c2e6;
        --line: #5a496f; --action: #68465b; --action-ink: #fff1e8;
        --danger: #ffc4b7; color-scheme: dark;
      }
      @media (prefers-color-scheme: dark) {
        dialog:not([data-theme="light"]) {
          --panel: #453657; --ink: #f7efff; --muted: #d2c2e6;
          --line: #5a496f; --action: #68465b; --action-ink: #fff1e8;
          --danger: #ffc4b7; color-scheme: dark;
        }
      }
    `,
    );
    dialog = document.createElement("dialog");
    dialog.setAttribute("data-theme", data.settings.theme ?? "system");
    dialog.setAttribute("aria-label", "Website paused during focus");
    const brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = "flow.";
    const title = document.createElement("h1");
    title.textContent = "Keep your flow.";
    title.tabIndex = -1;
    const copy = document.createElement("p");
    copy.textContent =
      "This website is blocked during focus. Head back to what you were working on.";
    const note = document.createElement("p");
    note.className = "note";
    note.textContent =
      "Ending now saves only your partial focus time. This session cannot be resumed.";
    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    const end = document.createElement("button");
    end.textContent = "End session and save partial time";
    end.onclick = async () => {
      end.disabled = true;
      error.textContent = "";
      try {
        const response = await chrome.runtime.sendMessage({
          action: { type: "pause" },
        });
        if (response.error) throw new Error(response.error);
        hide();
      } catch (e) {
        error.textContent = (e as Error).message;
        end.disabled = false;
      }
    };
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    dialog.append(brand, title, copy, note, end, error);
    shadow.adoptedStyleSheets = [style];
    shadow.append(dialog);
    document.documentElement.append(host);
    lockPage();
    dialog.showModal();
    title.focus();
  };
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area === "local" && changes.flow?.newValue)
      update(changes.flow.newValue as OverlayData);
  };
  chrome.storage.onChanged.addListener(listener);
  const refresh = () => {
    if (latest) update(latest);
  };
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("pageshow", refresh);
  try {
    const value = await chrome.storage.local.get<{ flow?: OverlayData }>("flow");
    if (value.flow) update(value.flow);
  } catch (error) {
    scope.__flowOverlayInstalled = false;
    chrome.storage.onChanged.removeListener(listener);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("pageshow", refresh);
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    hide();
    throw error;
  }
}
