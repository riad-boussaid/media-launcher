import { type DragEvent, useEffect, useState } from "react";
import NowPlaying from "../components/NowPlaying";
import SetupGate from "../components/SetupGate";
import {
  addWatchLater,
  discardSavedQueue,
  getHistory,
  getPlayerStatus,
  getSavedQueue,
  type HistoryEntry,
  type PlayerStatus,
  queueUrl,
  replayUrl,
  restoreSavedQueue,
  type SavedQueue,
} from "../lib/api";
import { hostOf } from "../lib/format";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function Play() {
  const [urlInput, setUrlInput] = useState("");
  const [toast, setToast] = useState<{ msg: string; variant: string } | null>(
    null,
  );
  const [pending, setPending] = useState<"play" | "queue" | "save" | null>(
    null,
  );
  const [dragOver, setDragOver] = useState(false);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [player, setPlayer] = useState<PlayerStatus | null>(null);
  const [savedQueue, setSavedQueue] = useState<SavedQueue | null>(null);
  const [savedPending, setSavedPending] = useState<
    "restore" | "discard" | null
  >(null);
  const [setupReady, setSetupReady] = useState<boolean | null>(null);

  const showToast = (msg: string, variant = "toast-success") => {
    setToast({ msg, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const loadPlayer = () => {
    void getPlayerStatus()
      .then(setPlayer)
      .catch(() => {});
  };

  const loadRecent = () => {
    void getHistory()
      .then((items) => setRecent(items.slice(0, 3)))
      .catch(() => {});
  };

  const loadSavedQueue = () => {
    void getSavedQueue()
      .then(setSavedQueue)
      .catch(() => {});
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    loadRecent();
    loadPlayer();
    loadSavedQueue();
    const t = setInterval(loadPlayer, 3000);
    return () => clearInterval(t);
  }, []);

  const sendUrl = async (url: string, queue: boolean) => {
    if (pending) return;
    if (queue) {
      showToast("Adding to queue…");
    }
    setPending(queue ? "queue" : "play");
    try {
      const res = queue ? await queueUrl(url) : await replayUrl(url);
      if (!res.success) {
        showToast(
          `Error: ${res.error ?? `Could not ${queue ? "queue" : "play"} URL`}`,
          "toast-error",
        );
        return;
      }
      showToast(queue ? "Added to queue" : "Playing…");
      setUrlInput("");
      loadRecent();
      loadPlayer();
    } finally {
      setPending(null);
    }
  };

  const handlePlay = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      showToast("Please enter a valid http(s) URL", "toast-error");
      return;
    }
    await sendUrl(url, false);
  };

  const handleQueue = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      showToast("Please enter a valid http(s) URL", "toast-error");
      return;
    }
    await sendUrl(url, true);
  };

  const handleSaveLater = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      showToast("Please enter a valid http(s) URL", "toast-error");
      return;
    }
    setPending("save");
    try {
      await addWatchLater(url);
      showToast("Saved to Watch Later");
    } catch {
      showToast("Could not save to Watch Later", "toast-error");
    } finally {
      setPending(null);
    }
  };

  const handlePaste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setUrlInput(text);
    } catch {
      showToast("Clipboard unavailable", "toast-error");
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const text =
      e.dataTransfer.getData("text/uri-list") ||
      e.dataTransfer.getData("text/plain");
    const url = text.trim().split(/\s+/)[0] ?? "";
    if (isValidUrl(url)) {
      setUrlInput(url);
      void sendUrl(url, false);
    } else {
      showToast("Drop an http(s) URL to play it", "toast-error");
    }
  };

  const isPlaying = Boolean(player?.alive && player.url);
  const canQueue = Boolean(player?.alive && player.ipcReady);

  useEffect(() => {
    if (isPlaying) return;
    void getSavedQueue()
      .then(setSavedQueue)
      .catch(() => {});
  }, [isPlaying]);

  const savedCount = savedQueue
    ? (savedQueue.current ? 1 : 0) + savedQueue.entries.length
    : 0;

  const handleRestoreQueue = async () => {
    if (savedPending) return;
    setSavedPending("restore");
    try {
      if (await restoreSavedQueue()) {
        setSavedQueue(null);
        showToast("Queue restored");
        loadPlayer();
      } else {
        showToast("Could not restore the queue", "toast-error");
      }
    } finally {
      setSavedPending(null);
    }
  };

  const handleDiscardQueue = async () => {
    if (savedPending) return;
    setSavedPending("discard");
    try {
      if (await discardSavedQueue()) {
        setSavedQueue(null);
      } else {
        showToast("Could not discard the queue", "toast-error");
      }
    } finally {
      setSavedPending(null);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for URLs
    <div
      className={`flex flex-col items-center ${
        isPlaying ? "justify-start" : "justify-center min-h-[62vh]"
      } rounded-xl transition-shadow ${
        dragOver
          ? "shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_4%,transparent)]"
          : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-md">
        <SetupGate onReadyChange={setSetupReady} />
        {setupReady !== false && (
          <>
            {savedQueue && !isPlaying && savedCount > 0 && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Saved queue
                  </div>
                  <div
                    className="truncate text-sm font-medium text-text"
                    title={
                      savedQueue.current?.title || savedQueue.current?.url || ""
                    }
                  >
                    {savedQueue.current?.title ||
                      (savedQueue.current
                        ? hostOf(savedQueue.current.url)
                        : "Up next")}
                  </div>
                  <div className="text-[11px] text-muted">
                    {savedCount} video{savedCount === 1 ? "" : "s"} ·{" "}
                    {savedQueue.entries.length} up next
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={savedPending !== null}
                    onClick={() => void handleRestoreQueue()}
                  >
                    {savedPending === "restore" ? "Restoring…" : "Restore"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={savedPending !== null}
                    onClick={() => void handleDiscardQueue()}
                  >
                    {savedPending === "discard" ? "Discarding…" : "Discard"}
                  </button>
                </div>
              </div>
            )}
            {!isPlaying && (
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center mb-3">
                  <svg
                    viewBox="0 0 24 24"
                    width="26"
                    height="26"
                    fill="var(--color-accent)"
                    aria-hidden="true"
                  >
                    <polygon points="7 4 21 12 7 20 7 4" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-text m-0">
                  Play a video
                </h2>
                <p className="text-xs text-muted mt-1 mb-0">
                  Paste a URL from YouTube or any supported site — or drop a
                  link anywhere here
                </p>
              </div>
            )}

            {isPlaying && player && (
              <div className="mb-5">
                <NowPlaying player={player} onRefresh={loadPlayer} />
              </div>
            )}

            <div>
              {isPlaying && (
                <div className="text-[10px] text-muted uppercase tracking-[0.06em] font-semibold mb-1.5">
                  Send another video
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    className="w-full h-[42px] px-3.5 pr-11 border border-border rounded-lg bg-surface text-text text-sm outline-none transition-colors placeholder:text-muted focus:border-[color-mix(in_oklab,var(--color-accent)_50%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
                    type="text"
                    placeholder={
                      isPlaying
                        ? "Paste another URL…"
                        : "Paste a URL and press Enter…"
                    }
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handlePlay();
                    }}
                    spellCheck={false}
                  />
                  {urlInput ? (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 action-btn"
                      title="Clear"
                      onClick={() => setUrlInput("")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 action-btn"
                      title="Paste from clipboard"
                      onClick={() => void handlePaste()}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-primary h-[42px] px-5 flex-shrink-0"
                  onClick={() => void handlePlay()}
                  disabled={!urlInput.trim() || pending !== null}
                >
                  {pending === "play" ? "Sending…" : "Play"}
                </button>
                <button
                  type="button"
                  className="btn-ghost h-[42px] px-4 flex-shrink-0"
                  onClick={() => void handleQueue()}
                  disabled={!urlInput.trim() || pending !== null || !canQueue}
                  title={
                    canQueue
                      ? "Add this URL to the queue"
                      : "Start a video before queueing another"
                  }
                >
                  {pending === "queue" ? "Adding…" : "Queue"}
                </button>
                <button
                  type="button"
                  className="btn-ghost h-[42px] w-[42px] px-0 flex-shrink-0"
                  onClick={() => void handleSaveLater()}
                  disabled={!urlInput.trim() || pending !== null}
                  title="Save to Watch Later"
                  aria-label="Save to Watch Later"
                >
                  {pending === "save" ? (
                    <span className="text-[11px] text-muted">…</span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {recent.length > 0 && (
              <div className="mt-7">
                <div className="text-[11px] text-muted uppercase tracking-[0.06em] font-semibold mb-2">
                  Recent
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((item) => (
                    <div
                      key={item.id}
                      className="inline-flex max-w-full items-center gap-1"
                    >
                      <button
                        type="button"
                        className="min-w-0 max-w-full flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full text-xs text-text-dim cursor-pointer hover:bg-elevated hover:border-border-strong hover:text-text transition-colors"
                        title={item.title || item.url}
                        onClick={() => void sendUrl(item.url, false)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="11"
                          height="11"
                          fill="var(--color-accent)"
                          aria-hidden="true"
                        >
                          <polygon points="6 3 20 12 6 21 6 3" />
                        </svg>
                        <span className="truncate">
                          {item.title || hostOf(item.url)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full border border-border bg-card text-muted cursor-pointer transition-colors hover:bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] hover:border-[color-mix(in_oklab,var(--color-accent)_40%,transparent)] hover:text-accent disabled:opacity-40 disabled:cursor-default"
                        title={
                          canQueue
                            ? `Add “${item.title || hostOf(item.url)}” to queue`
                            : "Start a video before queueing"
                        }
                        aria-label={`Add ${item.title || hostOf(item.url)} to queue`}
                        disabled={!canQueue || pending !== null}
                        onClick={() => void sendUrl(item.url, true)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="13"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}
