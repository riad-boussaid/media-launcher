import { type DragEvent, useEffect, useState } from "react";
import {
  getHistory,
  getPlayerStatus,
  type HistoryEntry,
  type PlayerStatus,
  replayUrl,
  skipTrack,
  togglePause,
} from "../lib/api";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Play() {
  const [urlInput, setUrlInput] = useState("");
  const [toast, setToast] = useState<{ msg: string; variant: string } | null>(
    null,
  );
  const [playing, setPlaying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [player, setPlayer] = useState<PlayerStatus | null>(null);

  const showToast = (msg: string, variant = "toast-success") => {
    setToast({ msg, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const loadPlayer = () => {
    void getPlayerStatus()
      .then(setPlayer)
      .catch(() => {});
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    void getHistory()
      .then((items) => setRecent(items.slice(0, 3)))
      .catch(() => {});
    loadPlayer();
    const t = setInterval(loadPlayer, 3000);
    return () => clearInterval(t);
  }, []);

  const playUrl = async (url: string) => {
    if (playing) return;
    setPlaying(true);
    try {
      const res = await replayUrl(url);
      if (!res.success) {
        showToast(`Error: ${res.error ?? "Could not play URL"}`, "toast-error");
        return;
      }
      showToast("Playing…");
      setUrlInput("");
      void getHistory()
        .then((items) => setRecent(items.slice(0, 3)))
        .catch(() => {});
      loadPlayer();
    } finally {
      setPlaying(false);
    }
  };

  const handlePlay = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      showToast("Please enter a valid http(s) URL", "toast-error");
      return;
    }
    await playUrl(url);
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
      void playUrl(url);
    } else {
      showToast("Drop an http(s) URL to play it", "toast-error");
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for URLs
    <div
      className={`flex flex-col items-center justify-center min-h-[62vh] rounded-xl transition-shadow ${
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
        <div className="flex flex-col items-center text-center mb-6">
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
          <h2 className="text-lg font-semibold text-text m-0">Play a video</h2>
          <p className="text-xs text-muted mt-1 mb-0">
            Paste a URL from YouTube or any supported site — or drop a link
            anywhere here
          </p>
        </div>

        <div className="relative">
          <input
            className="w-full px-3.5 py-3 pr-11 border border-border rounded-lg bg-surface text-text text-sm outline-none transition-colors placeholder:text-muted focus:border-[color-mix(in_oklab,var(--color-accent)_50%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
            type="text"
            placeholder="Paste a URL and press Enter…"
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
          className="btn-primary w-full mt-3"
          onClick={() => void handlePlay()}
          disabled={!urlInput.trim() || playing}
        >
          {playing ? "Sending…" : "Play"}
        </button>

        {player?.alive && player.url && (
          <div className="card p-4 mt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-[0.06em] font-semibold mb-1">
                  Now playing
                </div>
                <div
                  className="text-sm text-text font-medium truncate"
                  title={player.title || player.url}
                >
                  {player.title || hostOf(player.url)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  title={player.paused ? "Resume" : "Pause"}
                  disabled={!player.ipcReady}
                  onClick={() => {
                    void togglePause().then(loadPlayer);
                  }}
                >
                  {player.paused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  title="Skip to next in queue"
                  disabled={!player.ipcReady || player.queue.length === 0}
                  onClick={() => {
                    void skipTrack().then(loadPlayer);
                  }}
                >
                  Skip
                </button>
              </div>
            </div>

            {player.duration > 0 && (
              <div className="mt-2.5">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((player.position / player.duration) * 100),
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>{formatTime(player.position)}</span>
                  <span>{formatTime(player.duration)}</span>
                </div>
              </div>
            )}

            {player.queue.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] text-muted uppercase tracking-[0.06em] font-semibold mb-1.5">
                  Up next
                </div>
                {player.queue.slice(0, 3).map((item, index) => (
                  <div
                    key={`${item.url}-${index}`}
                    className="flex gap-1.5 text-xs text-text-dim leading-snug"
                  >
                    <span className="text-muted flex-shrink-0">
                      {index + 1}.
                    </span>
                    <span className="truncate">
                      {item.title || hostOf(item.url)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-7">
            <div className="text-[11px] text-muted uppercase tracking-[0.06em] font-semibold mb-2">
              Recent
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="max-w-full flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full text-xs text-text-dim cursor-pointer hover:bg-elevated hover:border-border-strong hover:text-text transition-colors"
                  title={item.title || item.url}
                  onClick={() => void playUrl(item.url)}
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
              ))}
            </div>
          </div>
        )}
      </div>
      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}
