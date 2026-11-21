import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { remaining, type Data } from "./domain";
function Blocked() {
  const [status, setStatus] = useState("Your focus session is in progress.");
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = (next: Data) => {
    setData(next);
    document.documentElement.dataset.theme = next.settings.theme;
    setStatus(
      next.timer.mode === "focus" &&
        !next.timer.paused &&
        remaining(next.timer, Date.now()) > 0
        ? "Your focus session is in progress."
        : "Your session has ended. Only the time you focused has been saved.",
    );
  };
  const focusing =
    data?.timer.mode === "focus" &&
    !data.timer.paused &&
    remaining(data.timer, Date.now()) > 0;
  useEffect(() => {
    chrome.runtime
      .sendMessage({ action: { type: "tick" } })
      .then((r) => {
        if (r.error) setError(r.error);
        if (r.data) accept(r.data);
      })
      .catch(() => setStatus("Open Flow from your toolbar to manage your session."));
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes.flow?.newValue)
        accept(changes.flow.newValue as Data);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return (
    <div className="blocked">
      <section className="blocked-panel" aria-label="Website paused during focus">
        <span className="brand">
          flow<span className="brand-dot">.</span>
        </span>
        <p className="eyebrow">
          {!data ? "FLOW" : focusing ? "FOCUS IN PROGRESS" : "SESSION ENDED"}
        </p>
        <h1>
          {!data ? "A moment of focus." : focusing ? "Keep your flow." : "Focus saved."}
          <br />
          {!data
            ? "One thing at a time."
            : focusing
              ? "This can wait."
              : "Take your time."}
        </h1>
        {focusing && <p>This website is blocked during focus.</p>}
        <p>{status}</p>
        {focusing && (
          <p className="quiet">
            Ending focus saves your partial focus time and unblocks websites.
            <br />
            This session cannot be resumed. Start a new one from the toolbar.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {focusing && (
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
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Blocked />);
