async function chime() {
  const context = new AudioContext();
  try {
    await context.resume();
    if (context.state !== "running") throw new Error("Audio playback is unavailable.");
    const start = context.currentTime + 0.015;
    // One bell strike: a clear fundamental with quiet, faster-decaying overtones.
    const partials = [
      { frequency: 880, volume: 0.14, decay: 0.38 },
      { frequency: 2428.8, volume: 0.022, decay: 0.18 },
      { frequency: 4752, volume: 0.006, decay: 0.09 },
    ];
    await Promise.all(
      partials.map(
        ({ frequency, volume, decay }) =>
          new Promise<void>((resolve) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
            oscillator.connect(gain).connect(context.destination);
            oscillator.onended = () => {
              oscillator.disconnect();
              gain.disconnect();
              resolve();
            };
            oscillator.start(start);
            oscillator.stop(start + decay + 0.015);
          }),
      ),
    );
  } finally {
    await context.close();
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "flow-audio") return;
  void chime().then(
    () => respond({ played: true }),
    () =>
      respond({
        error: "Unable to play audio. Check Chrome and your device's sound settings.",
      }),
  );
  return true;
});

export {};
