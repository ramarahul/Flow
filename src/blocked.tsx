import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import type { Data } from "./domain";
function Blocked() {
  const [status, setStatus] = useState("Your focus session is in progress.");
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = (next: Data) => {
    setData(next);
    document.documentElement.dataset.theme = next.settings.theme;
    setStatus(
      next.timer.mode === "focus" && !next.timer.paused
        ? "Your focus session is in progress."
        : "Your session has ended. Only the time you focused has been saved.",
    );
  };
  useEffect(() => {
    chrome.runtime
      .sendMessage({ action: { type: "tick" } })
      .then((r) => {
        if (r.error) setError(r.error);
        if (r.data) accept(r.data);
      })
      .catch(() => setStatus("Open Flow from your toolbar to manage your session."));
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.flow?.newValue) accept(changes.flow.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return (
    <div className="blocked">
      <span className="brand">
        flow<span className="brand-dot">.</span>
      </span>
      <p className="eyebrow">A LITTLE LESS DISTRACTION</p>
      <h1>
        Keep your attention
        <br />
        where you want it.
      </h1>
      <p>This website is on your Flow blocklist.</p>
      <p>{status}</p>
      <p className="quiet">
        Ending focus saves your partial focus time and unblocks websites.
        <br />
        This session cannot be resumed. Start a new one from the toolbar.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.timer.mode === "focus" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await chrome.runtime.sendMessage({
                action: { type: "pause" },
              });
              if (r.error) throw new Error(r.error);
              accept(r.data);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          End session and save partial time
        </button>
      )}
      <button
        className="primary"
        onClick={() => {
          if (history.length > 1) history.back();
          else window.close();
        }}
      >
        Go back
      </button>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Blocked />);
