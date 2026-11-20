import {
  type DragEvent,
  type JSX,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { isLiveLike, LiveBadge } from "../components/LiveBadge";
import NowPlaying from "../components/NowPlaying";
import SetupGate from "../components/SetupGate";
import { ShortBadge } from "../components/ShortBadge";
import { Thumbnail } from "../components/Thumbnail";
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
import { formatTime, hostOf, relativeTime } from "../lib/format";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function recentState(item: HistoryEntry): string {
  if (isLiveLike(item.liveStatus)) return "";
  if (item.completed) return "Watched";
  if (item.position > 60) return `Resume ${formatTime(item.position)}`;
  return relativeTime(item.timestamp);
}

function recentProgress(item: HistoryEntry): number {
  if (isLiveLike(item.liveStatus) || item.completed) return 0;
  const duration = item.duration ?? 0;
  if (duration <= 0 || item.position <= 0) return 0;
  return Math.min(
    99,
    Math.max(1, Math.round((item.position / duration) * 100)),
  );
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

  const playerLabel =
    player === null
      ? "Checking player…"
      : isPlaying
        ? player.paused
          ? "Paused"
          : "Playing"
        : player.alive
          ? "Player ready"
          : "No player";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for URLs
    <div
      className="min-h-full pb-4"
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
      <div
        className={`mx-auto w-full max-w-2xl rounded-xl transition-shadow ${
          dragOver ? "ring-2 ring-accent/50" : ""
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text">
              Play
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              Send a link to your player, queue it, or save it for later.
            </p>
          </div>
          <span
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-[10.5px] font-medium text-text-dim"
            title={
              player === null
                ? "Checking the player status"
                : isPlaying
                  ? player.paused
                    ? "The player is paused"
                    : "The player is playing a video"
                  : player.alive
                    ? "The player is running"
                    : "The player is not running"
            }
          >
            <span
              className={
                player?.alive
                  ? "status-dot online"
                  : "inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-muted)]"
              }
            />
            {playerLabel}
          </span>
        </div>

        <SetupGate onReadyChange={setSetupReady} />

        {setupReady !== false && (
          <>
            {savedQueue && !isPlaying && savedCount > 0 && (
              <section className="mb-3 flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/5 p-3.5">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-accent/10 text-accent">
                  <QueueIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-text-dim">
                    Saved queue
                  </div>
                  <div
                    className="mt-0.5 truncate text-[13px] font-medium text-text"
                    title={
                      savedQueue.current?.title ||
                      savedQueue.current?.url ||
                      ""
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
                <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
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
              </section>
            )}

            {isPlaying && player && (
              <div className="mb-3">
                <NowPlaying player={player} onRefresh={loadPlayer} />
              </div>
            )}

            <section className="card overflow-hidden">
              <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-accent/10 text-accent">
                  <PlayIcon />
                </span>
                <div className="min-w-0">
                  <h2 className="m-0 text-[13px] font-semibold text-text">
                    {isPlaying ? "Send another video" : "Send a video"}
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">
                    Paste a URL, press Enter, or drop a link anywhere.
                  </p>
                </div>
              </div>
              <div className="p-4">
                <div className="flex flex-col gap-2 min-[620px]:flex-row min-[620px]:items-center">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="h-10 w-full rounded-lg border border-border bg-surface pl-3 pr-10 text-[13px] text-text outline-none transition-colors placeholder:text-muted focus:border-[color-mix(in_oklab,var(--color-accent)_50%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
                      type="text"
                      placeholder={
                        isPlaying
                          ? "Paste another URL…"
                          : "Paste a video URL…"
                      }
                      aria-label="Video URL"
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
                        className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
                        aria-label="Clear URL"
                        onClick={() => setUrlInput("")}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
                        aria-label="Paste from clipboard"
                        onClick={() => void handlePaste()}
                      >
                        <ClipboardIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary h-10 flex-1 px-5 min-[620px]:flex-none"
                      onClick={() => void handlePlay()}
                      disabled={!urlInput.trim() || pending !== null}
                    >
                      {pending === "play" ? "Sending…" : "Play"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost h-10 flex-1 px-4 min-[620px]:flex-none"
                      onClick={() => void handleQueue()}
                      disabled={!urlInput.trim() || pending !== null || !canQueue}
                      title={
                        canQueue
                          ? "Add this URL to the queue"
                          : "Start a video before queueing"
                      }
                    >
                      {pending === "queue" ? "Adding…" : "Queue"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost h-10 w-10 flex-none px-0"
                      onClick={() => void handleSaveLater()}
                      disabled={!urlInput.trim() || pending !== null}
                      title="Save to Watch Later"
                      aria-label="Save to Watch Later"
                    >
                      {pending === "save" ? (
                        <span className="spinner" />
                      ) : (
                        <BookmarkIcon className="h-[15px] w-[15px]" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="mt-2 mb-0 text-[11px] leading-snug text-muted">
                  YouTube, Vimeo, Twitch, and other supported sites. Enter
                  plays the URL.
                </p>
              </div>
            </section>

            {recent.length > 0 && (
              <section className="mt-4">
                <div className="mb-1 flex items-center gap-2 px-1">
                  <h2 className="text-xs font-semibold text-text-dim">
                    Recent
                  </h2>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] tabular-nums text-muted">
                    {recent.length}
                  </span>
                  <button
                    type="button"
                    className="flex items-center gap-0.5 text-[11px] font-medium text-accent transition-colors hover:underline"
                    onClick={() => void window.electronAPI.window.openHistory()}
                  >
                    History
                    <ChevronRightIcon className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5">
                  {recent.map((item) => {
                    const completed = Boolean(item.completed);
                    const progress = recentProgress(item);
                    const state = recentState(item);
                    return (
                      <div
                        key={item.id}
                        className="group flex min-h-[60px] items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-card"
                      >
                        <button
                          type="button"
                          className="relative aspect-video w-20 flex-none overflow-hidden rounded-lg bg-black"
                          aria-label={`Play ${item.title || hostOf(item.url)}`}
                          onClick={() => void sendUrl(item.url, false)}
                        >
                          <Thumbnail
                            src={item.thumbnail}
                            className={`absolute inset-0 h-full w-full object-cover ${
                              completed ? "opacity-60 saturate-50" : ""
                            }`}
                            fallback={
                              <span className="grid h-full w-full place-items-center text-white/15">
                                <PlayIcon className="h-5 w-5" />
                              </span>
                            }
                          />
                          {completed && (
                            <span className="absolute left-1.5 top-1.5 z-[2] grid h-4 w-4 place-items-center rounded-full bg-black/60 text-accent">
                              <CheckIcon className="h-2.5 w-2.5" />
                            </span>
                          )}
                          <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-black shadow-lg">
                              <PlayFillIcon className="ml-0.5 h-3 w-3" />
                            </span>
                          </span>
                          {(item.duration ?? 0) > 0 && (
                            <span className="absolute bottom-1 right-1 z-[2] rounded bg-black/70 px-1 py-0.5 text-[10px] tabular-nums text-white">
                              {formatTime(item.duration ?? 0)}
                            </span>
                          )}
                          {progress > 0 && (
                            <span
                              className="absolute bottom-0 left-0 right-0 z-[2] h-[3px] bg-white/25"
                              aria-hidden="true"
                            >
                              <span
                                className="block h-full bg-accent"
                                style={{ width: `${progress}%` }}
                              />
                            </span>
                          )}
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <button
                            type="button"
                            className={`block max-w-full truncate text-left text-[13.5px] font-medium leading-[1.3] ${
                              completed ? "text-text-dim" : "text-text"
                            } hover:text-accent`}
                            title={item.title || item.url}
                            onClick={() => void sendUrl(item.url, false)}
                          >
                            {item.title || hostOf(item.url)}
                          </button>
                          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px] text-muted">
                            {item.isShort && (
                              <ShortBadge isShort url={item.url} />
                            )}
                            {isLiveLike(item.liveStatus) && (
                              <LiveBadge status={item.liveStatus} />
                            )}
                            <span className="truncate text-accent">
                              {hostOf(item.url)}
                            </span>
                            {state && (
                              <>
                                <span className="flex-none text-muted/50">
                                  ·
                                </span>
                                <span className="truncate">{state}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-accent disabled:cursor-default disabled:opacity-40"
                          title={
                            canQueue
                              ? `Add “${item.title || hostOf(item.url)}” to queue`
                              : "Start a video before queueing"
                          }
                          aria-label={`Add ${item.title || hostOf(item.url)} to queue`}
                          disabled={!canQueue || pending !== null}
                          onClick={() => void sendUrl(item.url, true)}
                        >
                          <QueueIcon className="h-[15px] w-[15px]" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}

function Icon({
  className = "h-3.5 w-3.5",
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </Icon>
  );
}

function PlayFillIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <polygon
        points="8 5 19 12 8 19 8 5"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

function QueueIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M3 6h12M3 12h9M3 18h9" />
      <path d="M18 12v8M14 16h8" />
    </Icon>
  );
}

function BookmarkIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

function ClipboardIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </Icon>
  );
}

function XIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

function CheckIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

function ChevronRightIcon({
  className,
}: {
  className?: string;
}): JSX.Element {
  return (
    <Icon className={className}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}
