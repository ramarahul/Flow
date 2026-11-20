import { it } from "node:test";
import { strict as assert } from "node:assert";

type Reply = { played?: boolean; error?: string };
let receive: (
  message: { target: string },
  sender: { id: string },
  respond: (value: Reply) => void,
) => boolean | undefined;
let tones = 0;
let closed = 0;
let failed = false;
let duration = 0;
const startTimes: number[] = [];

class AudioContextMock {
  state = "suspended";
  currentTime = 10;
  destination = {};
  async resume() {
    if (!failed) this.state = "running";
  }
  async close() {
    closed++;
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      disconnect() {},
    };
  }
  createOscillator() {
    tones++;
    let start = 0;
    return {
      type: "sine",
      frequency: { value: 0 },
      onended: () => {},
      connect(gain: unknown) {
        return gain;
      },
      disconnect() {},
      start(at: number) {
        start = at;
        startTimes.push(at);
      },
      stop(at: number) {
        duration = Math.max(duration, at - start);
        queueMicrotask(() => this.onended());
      },
    };
  }
}

Object.defineProperty(globalThis, "AudioContext", {
  value: AudioContextMock,
  configurable: true,
});
Object.defineProperty(globalThis, "chrome", {
  value: {
    runtime: {
      id: "flow-test",
      onMessage: {
        addListener: (listener: typeof receive) => {
          receive = listener;
        },
      },
    },
  },
  configurable: true,
});
await import("../src/offscreen.js");

it("plays one short bell strike with simultaneous overtones and releases the audio context", async () => {
  const result = await new Promise<Reply>((respond) =>
    receive({ target: "flow-audio" }, { id: "flow-test" }, respond),
  );
  assert.equal(result.played, true);
  assert.equal(tones, 3);
  assert.equal(new Set(startTimes).size, 1);
  assert(duration > 0 && duration < 0.5);
  assert.equal(closed, 1);
});

it("rejects foreign messages and cleans up when audio cannot start", async () => {
  assert.equal(
    receive({ target: "flow-audio" }, { id: "other-extension" }, () =>
      assert.fail("Foreign message was accepted"),
    ),
    undefined,
  );
  failed = true;
  const result = await new Promise<Reply>((respond) =>
    receive({ target: "flow-audio" }, { id: "flow-test" }, respond),
  );
  assert.match(result.error!, /Unable to play audio/);
  assert.equal(closed, 2);
});
