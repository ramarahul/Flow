import { it } from "node:test";
import { strict as assert } from "node:assert";
import { defaults, reduce } from "../src/domain.js";
import { installFocusOverlay } from "../src/overlay.js";

// Small DOM/timer harness for deadline handling without real sleeps.
// Native scrolling and modal behavior are covered in e2e/overlay.spec.mjs.
it("removes the warning at its deadline and restores it only for a new countdown", async () => {
  class Element {
    style = {
      values: new Map<string, { value: string; priority: string }>(),
      getPropertyValue(name: string) {
        return this.values.get(name)?.value ?? "";
      },
      getPropertyPriority(name: string) {
        return this.values.get(name)?.priority ?? "";
      },
      setProperty(name: string, value: string, priority = "") {
        this.values.set(name, { value, priority });
      },
      removeProperty(name: string) {
        this.values.delete(name);
      },
    };
    children: Element[] = [];
    parent: Element | null = null;
    open = false;
    textContent = "";
    className = "";
    tabIndex = 0;
    disabled = false;
    adoptedStyleSheets: unknown[] = [];
    constructor(readonly tag: string) {}
    get isConnected(): boolean {
      return this.tag === "root" || !!this.parent?.isConnected;
    }
    append(...nodes: Element[]) {
      for (const node of nodes) {
        node.parent = this;
        this.children.push(node);
      }
    }
    attachShadow() {
      const shadow = new Element("shadow");
      shadow.parent = this;
      return shadow;
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((node) => node !== this);
      this.parent = null;
    }
    close() {
      this.open = false;
    }
    showModal() {
      this.open = true;
    }
    focus() {}
    setAttribute() {}
    addEventListener() {}
    onclick?: () => Promise<void>;
  }
  const root = new Element("root");
  root.style.setProperty("overflow-y", "scroll");
  const events = new Map<string, () => void>();
  const tasks = new Map<number, () => void>();
  let nextTask = 0;
  let now = 1000;
  let data = reduce(defaults(), { type: "start", minutes: 10 }, now);
  data.settings.blocking = true;
  data.settings.sites = ["example.com"];
  let changed: (changes: unknown, area: string) => void = () => {};
  const replacements: Record<string, unknown> = {
    document: {
      documentElement: root,
      createElement: (tag: string) => new Element(tag),
      addEventListener: (name: string, fn: () => void) => events.set(name, fn),
      removeEventListener: (name: string) => events.delete(name),
    },
    window: {
      addEventListener: (name: string, fn: () => void) => events.set(name, fn),
      removeEventListener: (name: string) => events.delete(name),
    },
    location: { hostname: "example.com" },
    CSSStyleSheet: class {
      replaceSync() {}
    },
    chrome: {
      storage: {
        local: { get: async () => ({ flow: data }) },
        onChanged: {
          addListener: (fn: typeof changed) => {
            changed = fn;
          },
          removeListener: () => {},
        },
      },
    },
    setTimeout: (fn: () => void) => {
      tasks.set(++nextTask, fn);
      return nextTask;
    },
    clearTimeout: (id: number) => tasks.delete(id),
  };
  const descriptors = new Map(
    Object.keys(replacements).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const realNow = Date.now;
  try {
    for (const [key, value] of Object.entries(replacements))
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    Date.now = () => now;
    await installFocusOverlay();
    assert.equal(root.children.length, 1);
    assert.equal(tasks.size, 1);
    assert.equal(root.style.getPropertyValue("overflow-y"), "hidden");
    assert.equal(root.style.getPropertyPriority("overflow-y"), "important");
    assert(events.has("wheel"));
    await installFocusOverlay();
    assert.equal(root.children.length, 1);
    now += 600000;
    [...tasks.values()][0]();
    assert.equal(root.children.length, 0);
    assert.equal(tasks.size, 0);
    assert.equal(root.style.getPropertyValue("overflow-y"), "scroll");
    assert.equal(root.style.getPropertyPriority("overflow-y"), "");
    assert(!events.has("wheel"));
    assert(!events.has("touchmove"));
    assert(!events.has("keydown"));
    data = reduce(data, { type: "extend", minutes: 5 }, now);
    changed({ flow: { newValue: data } }, "local");
    assert.equal(root.children.length, 1);
    now += 300000;
    events.get("visibilitychange")!();
    assert.equal(root.children.length, 0);
  } finally {
    Date.now = realNow;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    Reflect.deleteProperty(globalThis, "__flowOverlayInstalled");
  }
});
