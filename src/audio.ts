export async function playCompletionSound() {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (!contexts.length)
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification:
        "Play a completion chime when the timer ends, even with the popup closed.",
    });
  const response = await chrome.runtime.sendMessage({ target: "flow-audio" });
  if (!response?.played)
    throw new Error(response?.error || "Unable to play the completion sound.");
}
