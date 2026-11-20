import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLiveLike, LiveBadge } from "../components/LiveBadge";
import { ShortBadge } from "../components/ShortBadge";
import { Thumbnail } from "../components/Thumbnail";
import type { HistoryEntry } from "../lib/api";
import {
  addWatchLater,
  clearHistory,
  deleteHistory,
  getHistory,
  getPlayerStatus,
  openExternal,
  queueUrl,
  replayUrl,
} from "../lib/api";
import { displayUrl, relativeTime } from "../lib/format";

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupLabel(ts: number): string {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterday = today - 86400000;
  const weekStart = today - now.getDay() * 86400000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (ts >= today) return "Today";
  if (ts >= yesterday) return "Yesterday";
  if (ts >= weekStart) return "This Week";
  if (ts >= monthStart) return "This Month";
  return "Older";
}

export default function History({ focusSignal = 0 }: { focusSignal?: number }) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; variant: string } | null>(
    null,
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [canQueue, setCanQueue] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // App bumps focusSignal (Ctrl+2 / Ctrl+F) to jump here and focus the search.
  useEffect(() => {
    if (focusSignal > 0) searchRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmingClear) {
        setConfirmingClear(false);
      } else if (selectMode) {
        setSelected(new Set());
        setSelectMode(false);
      } else if (search) {
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmingClear, selectMode, search]);

  const load = useCallback(async () => {
    try {
      setItems(await getHistory());
      setLoadError(false);
    } catch {
      // Server unreachable — keep current items, but show an offline state
      // when there is nothing to display yet.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = () => {
    setLoading(true);
    setLoadError(false);
    void load();
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Queueing only makes sense while mpv is running; otherwise the server would
  // start a new playback instead of appending to a queue.
  useEffect(() => {
    let cancelled = false;
    const refreshQueueState = () => {
      void getPlayerStatus()
        .then((status) => {
          if (!cancelled) setCanQueue(status.alive && status.ipcReady);
        })
        .catch(() => {
          if (!cancelled) setCanQueue(false);
        });
    };
    refreshQueueState();
    const timer = setInterval(refreshQueueState, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const hasPending = items.some(
      (e) =>
        (!e.title && !e.thumbnail) ||
        (!e.liveStatus && Date.now() - e.timestamp < 60_000),
    );
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(load, 3000);
    }
    if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [items, load]);

  const showToast = (msg: string, variant = "toast-success") => {
    setToast({ msg, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          item.url.toLowerCase().includes(search.toLowerCase()) ||
          item.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search],
  );

  const grouped = useMemo(() => {
    const map: Record<string, HistoryEntry[]> = {};
    for (const item of filtered) {
      const label = groupLabel(item.timestamp);
      if (!map[label]) map[label] = [];
      map[label].push(item);
    }
    const order = ["Today", "Yesterday", "This Week", "This Month", "Older"];
    return order
      .filter((g) => map[g])
      .map((g) => ({ label: g, entries: map[g] }));
  }, [filtered]);

  const handleDelete = async (id: string) => {
    try {
      setItems(await deleteHistory(id));
    } catch {
      showToast("Could not remove that entry", "toast-error");
    }
  };

  const handleClear = async () => {
    try {
      await clearHistory();
      setItems([]);
      setConfirmingClear(false);
      showToast("History cleared");
    } catch {
      showToast("Could not clear history", "toast-error");
    }
  };

  const handlePlayUrl = async (url: string) => {
    const res = await replayUrl(url);
    if (!res.success) {
      showToast(`Error: ${res.error ?? "Could not play URL"}`, "toast-error");
      return;
    }
    setItems(await getHistory());
    showToast("Playing…", "toast-success");
  };

  const handleReplay = handlePlayUrl;

  const handleQueue = async (url: string) => {
    if (!canQueue) {
      showToast("Start a video before queueing", "toast-error");
      return;
    }
    const res = await queueUrl(url);
    if (!res.success) {
      showToast(`Error: ${res.error ?? "Could not queue URL"}`, "toast-error");
      return;
    }
    showToast("Added to queue");
    // Queueing refreshes the history entry's timestamp.
    void getHistory()
      .then(setItems)
      .catch(() => {});
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast("Copied");
  };

  const handleSaveLater = async (item: HistoryEntry) => {
    try {
      await addWatchLater(item.url, item.title, item.thumbnail);
      showToast("Saved to Watch Later");
    } catch {
      showToast("Could not save to Watch Later", "toast-error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  };

  const handleDeleteSelected = async () => {
    try {
      await Promise.allSettled([...selected].map((id) => deleteHistory(id)));
      setItems(await getHistory().catch(() => items));
    } finally {
      setSelected(new Set());
      setSelectMode(false);
    }
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 relative flex items-center">
          <svg
            className="absolute left-2.5 w-4 h-4 text-muted pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            className="w-full py-2 pl-8 pr-8 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors placeholder:text-muted"
            type="text"
            placeholder="Search history… (Ctrl+F)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-1.5 bg-none border-none text-muted text-lg cursor-pointer px-1.5 py-0.5 rounded hover:text-text hover:bg-elevated"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        {items.length > 0 && !selectMode && !confirmingClear && (
          <>
            <button
              type="button"
              className="btn-danger flex-shrink-0"
              onClick={() => setConfirmingClear(true)}
            >
              Clear all
            </button>
            <button
              type="button"
              className="btn-ghost flex-shrink-0"
              onClick={() => setSelectMode(true)}
            >
              Select
            </button>
          </>
        )}
        {selectMode && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              All
            </label>
            <button
              type="button"
              className="btn-ghost flex-shrink-0"
              onClick={() => {
                setSelected(new Set());
                setSelectMode(false);
              }}
            >
              Cancel
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="btn-danger flex-shrink-0"
                onClick={handleDeleteSelected}
              >
                Delete ({selected.size})
              </button>
            )}
          </div>
        )}
      </div>

      {confirmingClear && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-danger/30 bg-danger/10">
          <span className="flex-1 text-xs text-text-dim leading-snug">
            Clear all {items.length} {items.length === 1 ? "entry" : "entries"}?
            This can't be undone.
          </span>
          <button
            type="button"
            className="btn-ghost btn-sm flex-shrink-0"
            onClick={() => setConfirmingClear(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger btn-sm flex-shrink-0"
            onClick={() => void handleClear()}
          >
            Clear all
          </button>
        </div>
      )}

      {items.length > 0 && !search && !loading && (
        <div className="text-[11.5px] text-muted mb-2 uppercase tracking-[0.5px]">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </div>
      )}

      {loading && items.length === 0 ? (
        <HistorySkeleton />
      ) : loadError && items.length === 0 ? (
        <HistoryOffline onRetry={retry} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 px-5 text-muted">
          {search ? (
            <>
              <p>No results for "{search}"</p>
              <button
                type="button"
                className="btn-primary mt-3"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <p>No history yet</p>
              <p className="text-xs mt-2 text-muted/70">
                Play a video from your browser to see it here
              </p>
            </>
          )}
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.label}>
            <div className="text-[11.5px] text-muted uppercase tracking-[1px] pt-3 pb-1.5 px-1 font-semibold">
              {group.label}
            </div>
            {group.entries.map((item) => {
              const { host, path } = displayUrl(item.url);
              const progress =
                !isLiveLike(item.liveStatus) &&
                !item.completed &&
                item.position > 0 &&
                (item.duration ?? 0) > 0
                  ? Math.min(
                      100,
                      Math.round((item.position / (item.duration ?? 1)) * 100),
                    )
                  : 0;
              return (
                <div
                  key={item.id}
                  className={`relative flex items-stretch mb-1 rounded-lg overflow-hidden transition-colors min-h-[56px] hover:bg-card group ${selectMode ? "cursor-default" : ""}`}
                >
                  {selectMode && (
                    // biome-ignore lint/a11y/noStaticElementInteractions: checkbox wrapper layout
                    // biome-ignore lint/a11y/useKeyWithClickEvents: checkbox wrapper layout
                    <div
                      className="flex items-center pl-2 pr-1 cursor-pointer"
                      onClick={() => toggleSelect(item.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        readOnly
                      />
                    </div>
                  )}
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: thumbnail clickable area */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: thumbnail clickable area */}
                  <div
                    className="relative w-20 flex-shrink-0 bg-black/40 cursor-pointer flex items-center justify-center rounded-l-lg overflow-hidden"
                    onClick={() =>
                      selectMode
                        ? toggleSelect(item.id)
                        : handleReplay(item.url)
                    }
                  >
                    <Thumbnail
                      src={item.thumbnail}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={
                        <svg
                          className="w-5 h-5 text-white/15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2 px-2.5 py-2 cursor-pointer min-w-0 border-none bg-transparent text-left"
                    aria-label={
                      selectMode
                        ? `Select ${item.title || item.url}`
                        : `Play ${item.title || item.url}`
                    }
                    onClick={() =>
                      selectMode
                        ? toggleSelect(item.id)
                        : handleReplay(item.url)
                    }
                  >
                    <div className="flex-1 min-w-0" title={item.url}>
                      {item.title ? (
                        <div className="text-sm font-medium text-text overflow-hidden text-ellipsis whitespace-nowrap mb-0.5">
                          {item.title}
                        </div>
                      ) : null}
                      <div className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                        {item.isShort && (
                          <span className="mr-1.5 inline-flex align-middle">
                            <ShortBadge isShort url={item.url} />
                          </span>
                        )}
                        {item.liveStatus && item.liveStatus !== "none" && (
                          <span className="mr-1.5 inline-flex align-middle">
                            <LiveBadge status={item.liveStatus} />
                          </span>
                        )}
                        <span className="text-accent">{host}</span>
                        <span className="text-muted">{path}</span>
                        {!isLiveLike(item.liveStatus) && item.position > 60 && (
                          <span className="text-muted ml-1.5">
                            · resume {Math.floor(item.position / 60)}:
                            {Math.floor(item.position % 60)
                              .toString()
                              .padStart(2, "0")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="text-[11.5px] text-muted whitespace-nowrap flex-shrink-0"
                      title={timeLabel(item.timestamp)}
                    >
                      {relativeTime(item.timestamp)}
                    </div>
                  </button>
                  {!selectMode && (
                    <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 px-1 py-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <button
                        type="button"
                        className="action-btn queue"
                        title={
                          canQueue
                            ? "Add to queue"
                            : "Start a video before queueing"
                        }
                        aria-label="Add to queue"
                        disabled={!canQueue}
                        onClick={() => void handleQueue(item.url)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 6h12M3 12h9M3 18h9" />
                          <path d="M18 12v8M14 16h8" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="action-btn later"
                        title="Save to Watch Later"
                        aria-label="Save to Watch Later"
                        onClick={() => void handleSaveLater(item)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="action-btn replay"
                        title="Play again"
                        onClick={() => handleReplay(item.url)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          width="14"
                          height="14"
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="action-btn copy"
                        title="Copy URL"
                        onClick={() => handleCopy(item.url)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          width="14"
                          height="14"
                          aria-hidden="true"
                        >
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                          />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="action-btn open"
                        title="Open in browser"
                        onClick={() => void openExternal(item.url)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          width="14"
                          height="14"
                          aria-hidden="true"
                        >
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="action-btn delete"
                        title="Remove"
                        onClick={() => handleDelete(item.id)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          width="14"
                          height="14"
                          aria-hidden="true"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}

function HistorySkeleton() {
  const widths = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"];
  return (
    <div
      className="pt-2 flex flex-col gap-2"
      role="status"
      aria-label="Loading history"
    >
      {widths.map((width) => (
        <div key={width} className="flex items-stretch gap-2 animate-pulse">
          <div className="w-20 h-14 flex-shrink-0 rounded-lg bg-elevated" />
          <div className="flex-1 py-2 flex flex-col justify-center gap-2">
            <div className={`h-3 rounded bg-elevated ${width}`} />
            <div className="h-2.5 w-1/3 rounded bg-elevated/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-10 px-5">
      <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-danger/10 text-danger flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </div>
      <p className="text-sm font-medium text-text m-0">
        Can't reach the server
      </p>
      <p className="text-xs text-muted mt-1.5 mb-0 max-w-xs mx-auto">
        The local server may still be starting. Your history is stored on this
        machine.
      </p>
      <button type="button" className="btn-primary mt-4" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
