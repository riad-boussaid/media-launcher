import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLiveLike, LiveBadge } from "../components/LiveBadge";
import { ShortBadge } from "../components/ShortBadge";
import { Thumbnail } from "../components/Thumbnail";
import type { WatchLaterEntry } from "../lib/api";
import {
  clearWatchLater,
  deleteWatchLater,
  exportWatchLater,
  getPlayerStatus,
  getWatchLater,
  importWatchLater,
  openExternal,
  playWatchLater,
  queueUrl,
  queueWatchLater,
  refreshWatchLater,
  reorderWatchLater,
  replayUrl,
  resetWatchLaterProgress,
} from "../lib/api";
import { displayUrl, formatTime, relativeTime } from "../lib/format";

type SortMode = "newest" | "oldest" | "title" | "custom";

const SORT_KEY = "ml-later-sort";
const CONTINUE_KEY = "ml-later-continue";
const HIDE_SHORTS_KEY = "ml-later-hide-shorts";

function statusLabel(item: WatchLaterEntry): string {
  if (isLiveLike(item.liveStatus)) return "";
  if (item.completed) return "Watched";
  if ((item.position ?? 0) > 60) {
    return `Resume ${formatTime(item.position ?? 0)}`;
  }
  return `Saved ${relativeTime(item.addedAt)}`;
}

export default function WatchLater({
  focusSignal = 0,
}: {
  focusSignal?: number;
}) {
  const [items, setItems] = useState<WatchLaterEntry[]>([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; variant: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [canQueue, setCanQueue] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortMode>(() => {
    const stored = localStorage.getItem(SORT_KEY);
    return stored === "oldest" || stored === "title" || stored === "custom"
      ? stored
      : "newest";
  });
  const [continueOnly, setContinueOnly] = useState(
    () => localStorage.getItem(CONTINUE_KEY) === "1",
  );
  const [hideShorts, setHideShorts] = useState(
    () => localStorage.getItem(HIDE_SHORTS_KEY) === "1",
  );
  const [watchedOpen, setWatchedOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, variant = "toast-success") => {
    setToast({ msg, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const load = useCallback(async () => {
    try {
      setItems(await getWatchLater());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // App bumps focusSignal (Ctrl+4) to jump here and focus the search.
  useEffect(() => {
    if (focusSignal > 0) searchRef.current?.focus();
  }, [focusSignal]);

  // yt-dlp enrichment can lag behind the save; keep polling while an entry
  // lacks metadata or a recent entry's live status is still unknown.
  useEffect(() => {
    if (
      !items.some(
        (e) =>
          (!e.title && !e.thumbnail) ||
          (!e.liveStatus && Date.now() - e.addedAt < 60_000),
      )
    )
      return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [items, load]);

  useEffect(() => {
    const poll = () => {
      void getPlayerStatus()
        .then((status) => setCanQueue(Boolean(status.alive && status.ipcReady)))
        .catch(() => setCanQueue(false));
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

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
  }, [confirmingClear, search, selectMode]);

  const searched = useMemo(
    () =>
      items.filter(
        (item) =>
          item.url.toLowerCase().includes(search.toLowerCase()) ||
          item.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search],
  );

  const visible = useMemo(() => {
    let list = searched;
    if (hideShorts) {
      list = list.filter((item) => !item.isShort);
    }
    if (continueOnly) {
      list = list.filter(
        (item) =>
          !isLiveLike(item.liveStatus) &&
          !item.completed &&
          (item.position ?? 0) > 0,
      );
    }
    if (sort === "newest") {
      return [...list].sort((a, b) => b.addedAt - a.addedAt);
    }
    if (sort === "oldest") {
      return [...list].sort((a, b) => a.addedAt - b.addedAt);
    }
    if (sort === "title") {
      return [...list].sort((a, b) =>
        (a.title || a.url).localeCompare(b.title || b.url, undefined, {
          sensitivity: "base",
        }),
      );
    }
    // "custom" keeps the server's manual order.
    return list;
  }, [searched, continueOnly, sort, hideShorts]);

  const activeRows = visible.filter((item) => !item.completed);
  const watchedRows = visible.filter((item) => item.completed);
  const groupWatched = sort !== "custom";
  // Selection applies to what is actually shown; the collapsed watched section
  // is not selectable until it is expanded.
  const selectableRows = groupWatched && !watchedOpen ? activeRows : visible;
  const selectedIds = selectableRows
    .filter((item) => selected.has(item.id))
    .map((item) => item.id);
  const allSelected =
    selectableRows.length > 0 && selectedIds.length === selectableRows.length;

  const rows: Array<
    | { kind: "item"; item: WatchLaterEntry }
    | { kind: "watched-header"; count: number }
  > = groupWatched
    ? [
        ...activeRows.map((item) => ({ kind: "item" as const, item })),
        ...(watchedRows.length > 0
          ? [
              { kind: "watched-header" as const, count: watchedRows.length },
              ...(watchedOpen
                ? watchedRows.map((item) => ({ kind: "item" as const, item }))
                : []),
            ]
          : []),
      ]
    : visible.map((item) => ({ kind: "item" as const, item }));

  const changeSort = (value: SortMode) => {
    setSort(value);
    localStorage.setItem(SORT_KEY, value);
  };

  const changeContinue = (value: boolean) => {
    setContinueOnly(value);
    localStorage.setItem(CONTINUE_KEY, value ? "1" : "0");
  };

  const changeHideShorts = (value: boolean) => {
    setHideShorts(value);
    localStorage.setItem(HIDE_SHORTS_KEY, value ? "1" : "0");
  };

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    void load();
  };

  // Live statuses change while a stream is running; the server refreshes them
  // on list reads, and this poll picks up the result.
  useEffect(() => {
    if (!items.some((e) => isLiveLike(e.liveStatus))) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [items, load]);

  const handleDelete = async (id: string) => {
    try {
      setItems(await deleteWatchLater(id));
    } catch {
      showToast("Could not remove that video", "toast-error");
    }
  };

  const handleClear = async () => {
    try {
      await clearWatchLater();
      setItems([]);
      setConfirmingClear(false);
      showToast("Watch Later cleared");
    } catch {
      showToast("Could not clear Watch Later", "toast-error");
    }
  };

  const handlePlay = async (url: string) => {
    const res = await replayUrl(url);
    if (!res.success) {
      showToast(`Error: ${res.error ?? "Could not play URL"}`, "toast-error");
      return;
    }
    showToast("Playing…");
  };

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
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast("Copied");
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
    setSelected(
      allSelected ? new Set() : new Set(selectableRows.map((item) => item.id)),
    );
  };

  const exitSelectMode = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const handlePlayMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    const res = await playWatchLater(ids);
    if (!res.success) {
      showToast(
        `Error: ${res.error ?? "Could not play those videos"}`,
        "toast-error",
      );
      return;
    }
    const count = res.count ?? ids.length;
    const total = res.total ?? count;
    exitSelectMode();
    void load();
    showToast(
      total > count
        ? `Playing ${count} of ${total} videos`
        : `Playing ${count} ${count === 1 ? "video" : "videos"}`,
    );
  };

  const handleQueueMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!canQueue) {
      showToast("Start a video before queueing", "toast-error");
      return;
    }
    const res = await queueWatchLater(ids);
    if (!res.success) {
      showToast(
        `Error: ${res.error ?? "Could not queue those videos"}`,
        "toast-error",
      );
      return;
    }
    const count = res.count ?? ids.length;
    exitSelectMode();
    void load();
    showToast(`Queued ${count} ${count === 1 ? "video" : "videos"}`);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) => deleteWatchLater(id)),
    );
    const failed = results.some((result) => result.status === "rejected");
    exitSelectMode();
    await load();
    showToast(
      failed
        ? `Removed some of ${ids.length} videos`
        : `Removed ${ids.length} ${ids.length === 1 ? "video" : "videos"}`,
      failed ? "toast-error" : "toast-success",
    );
  };

  const handleResetProgress = async (id: string) => {
    try {
      setItems(await resetWatchLaterProgress(id));
      showToast("Marked unwatched");
    } catch {
      showToast("Could not reset progress", "toast-error");
    }
  };

  const handleRefresh = async (id: string) => {
    if (refreshingId) return;
    setRefreshingId(id);
    try {
      setItems(await refreshWatchLater(id));
      showToast("Metadata refreshed");
    } catch {
      showToast("Could not refresh metadata", "toast-error");
    } finally {
      setRefreshingId(null);
    }
  };

  const persistOrder = async (ids: string[]) => {
    try {
      setItems(await reorderWatchLater(ids));
      showToast("Order updated");
    } catch {
      showToast("Could not reorder Watch Later", "toast-error");
    }
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    if (sort !== "custom") return;
    if (search || continueOnly) {
      showToast("Clear search and Continue to reorder", "toast-error");
      return;
    }
    const ids = items.map((item) => item.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await persistOrder(ids);
  };

  const handleDrop = async (targetId: string, sourceIdArg?: string) => {
    const sourceId = sourceIdArg || dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    if (sort !== "custom") return;
    if (search || continueOnly) {
      showToast("Clear search and Continue to reorder", "toast-error");
      return;
    }
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    await persistOrder(ids);
  };

  const handleExport = async () => {
    try {
      const res = await exportWatchLater();
      if (res.canceled) return;
      if (res.error) {
        showToast(`Export failed: ${res.error}`, "toast-error");
        return;
      }
      const count = res.count ?? 0;
      showToast(`Exported ${count} ${count === 1 ? "video" : "videos"}`);
    } catch {
      showToast("Export failed", "toast-error");
    }
  };

  const handleImport = async () => {
    try {
      const res = await importWatchLater();
      if (res.canceled) return;
      if (res.error) {
        showToast(`Import failed: ${res.error}`, "toast-error");
        return;
      }
      await load();
      const imported = res.imported ?? 0;
      const skipped = res.skipped ?? 0;
      showToast(
        skipped > 0
          ? `Imported ${imported}, skipped ${skipped}`
          : `Imported ${imported} ${imported === 1 ? "video" : "videos"}`,
        imported > 0 || skipped === 0 ? "toast-success" : "toast-error",
      );
    } catch {
      showToast("Import failed", "toast-error");
    }
  };

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
            placeholder="Search Watch Later… (Ctrl+4)"
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
        {items.length > 0 && !confirmingClear && (
          <button
            type="button"
            className="btn-danger flex-shrink-0"
            onClick={() => setConfirmingClear(true)}
          >
            Clear all
          </button>
        )}
      </div>

      {items.length > 0 && !confirmingClear && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {!selectMode ? (
            <>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={activeRows.length === 0}
                title="Play every unwatched video currently listed"
                onClick={() =>
                  void handlePlayMany(activeRows.map((item) => item.id))
                }
              >
                Play all
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={!canQueue || activeRows.length === 0}
                title={
                  canQueue
                    ? "Queue every unwatched video currently listed"
                    : "Start a video before queueing"
                }
                onClick={() =>
                  void handleQueueMany(activeRows.map((item) => item.id))
                }
              >
                Queue all
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setSelected(new Set());
                  setSelectMode(true);
                }}
              >
                Select
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                title="Export every saved video to a JSON file"
                onClick={() => void handleExport()}
              >
                Export
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                title="Import videos from a JSON file"
                onClick={() => void handleImport()}
              >
                Import
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={continueOnly}
                    onChange={(e) => changeContinue(e.target.checked)}
                  />
                  Continue
                </label>
                <label className="text-xs text-muted flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideShorts}
                    onChange={(e) => changeHideShorts(e.target.checked)}
                  />
                  Hide Shorts &amp; Reels
                </label>
                <select
                  className="h-8 px-2 bg-surface border border-border rounded-lg text-xs text-text outline-none focus:border-accent cursor-pointer"
                  value={sort}
                  onChange={(e) => changeSort(e.target.value as SortMode)}
                  aria-label="Sort Watch Later"
                >
                  <option value="newest">Newest saved</option>
                  <option value="oldest">Oldest saved</option>
                  <option value="title">Title A–Z</option>
                  <option value="custom">Custom order</option>
                </select>
                {sort === "custom" && (
                  <span className="text-[10px] text-muted whitespace-nowrap">
                    Drag or use ↑↓ to reorder
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
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
                className="btn-primary btn-sm"
                disabled={selectedIds.length === 0}
                onClick={() => void handlePlayMany(selectedIds)}
              >
                Play selected
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={!canQueue || selectedIds.length === 0}
                onClick={() => void handleQueueMany(selectedIds)}
              >
                Queue selected
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => void handleDeleteSelected()}
                >
                  Remove ({selectedIds.length})
                </button>
              )}
              <button
                type="button"
                className="btn-ghost btn-sm ml-auto"
                onClick={exitSelectMode}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {confirmingClear && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-danger/30 bg-danger/10">
          <span className="flex-1 text-xs text-text-dim leading-snug">
            Clear all {items.length} saved{" "}
            {items.length === 1 ? "video" : "videos"}? This can't be undone.
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
          {selectMode
            ? `${selectedIds.length} selected`
            : continueOnly
              ? `${visible.length} of ${items.length} in progress`
              : hideShorts
                ? `${visible.length} of ${items.length} (short-form hidden)`
                : `${items.length} saved ${
                    items.length === 1 ? "video" : "videos"
                  }`}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {["w-4/5", "w-3/5", "w-2/3", "w-1/2"].map((width) => (
            <div
              key={width}
              className="flex items-center gap-2 px-3 py-3 rounded-lg border border-border animate-pulse"
            >
              <div className="w-20 h-11 rounded bg-elevated" />
              <div className="flex-1 space-y-2">
                <div className={`h-3 rounded bg-elevated ${width}`} />
                <div className="h-2.5 w-1/3 rounded bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError && items.length === 0 ? (
        <div className="card text-center py-8 px-5">
          <p className="text-sm text-text-dim mb-1">
            Couldn't load Watch Later
          </p>
          <p className="text-xs text-muted mb-4">
            The local server isn't responding.
          </p>
          <button type="button" className="btn-primary" onClick={retry}>
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
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
          ) : items.length === 0 ? (
            <>
              <p>Nothing saved yet</p>
              <p className="text-xs mt-2 text-muted/70">
                Save videos with the browser extension or from the Play page
              </p>
              <button
                type="button"
                className="btn-ghost mt-3"
                onClick={() => void handleImport()}
              >
                Import from JSON
              </button>
            </>
          ) : hideShorts && visible.length === 0 ? (
            <>
              <p>Shorts and Reels are hidden</p>
              <button
                type="button"
                className="btn-ghost mt-3"
                onClick={() => changeHideShorts(false)}
              >
                Show Shorts &amp; Reels
              </button>
            </>
          ) : (
            <>
              <p>Nothing in progress</p>
              <button
                type="button"
                className="btn-ghost mt-3"
                onClick={() => changeContinue(false)}
              >
                Show all videos
              </button>
            </>
          )}
        </div>
      ) : (
        rows.map((row) => {
          if (row.kind === "watched-header") {
            return (
              <button
                key="watched-header"
                type="button"
                aria-expanded={watchedOpen}
                className="mt-4 mb-1 flex w-full items-center gap-1.5 px-1 py-1 text-[11.5px] text-muted uppercase tracking-[1px] font-semibold hover:text-text"
                onClick={() => setWatchedOpen((open) => !open)}
              >
                <svg
                  className={`w-3 h-3 transition-transform ${
                    watchedOpen ? "" : "-rotate-90"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                Watched ({row.count})
              </button>
            );
          }
          const item = row.item;
          const { host, path } = displayUrl(item.url);
          const progress = isLiveLike(item.liveStatus)
            ? 0
            : item.completed
              ? 100
              : (item.duration ?? 0) > 0
                ? Math.min(
                    100,
                    Math.round(
                      ((item.position ?? 0) / (item.duration ?? 1)) * 100,
                    ),
                  )
                : 0;
          const status = statusLabel(item);
          const reorderBlocked = Boolean(search) || continueOnly;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: the row is a drop target; the handle button provides keyboard reordering
            <div
              key={item.id}
              className={`relative flex items-stretch mb-1 rounded-lg overflow-hidden transition-colors min-h-[56px] hover:bg-card group ${
                selectMode && selected.has(item.id) ? "bg-card" : ""
              } ${
                dragOverId === item.id && dragId !== item.id
                  ? "ring-2 ring-inset ring-accent/60"
                  : ""
              }`}
              onDragOver={(e) => {
                if (sort !== "custom" || selectMode || reorderBlocked) return;
                e.preventDefault();
                if (dragId && dragId !== item.id) setDragOverId(item.id);
              }}
              onDrop={(e) => {
                if (sort !== "custom" || selectMode) return;
                e.preventDefault();
                void handleDrop(item.id, e.dataTransfer.getData("text/plain"));
              }}
            >
              {selectMode && (
                <label className="flex items-center pl-2 pr-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                  />
                </label>
              )}
              {sort === "custom" && !selectMode && (
                <div className="flex items-center pl-1 pr-0.5">
                  <button
                    type="button"
                    draggable={!reorderBlocked}
                    className="action-btn cursor-grab active:cursor-grabbing"
                    title={
                      reorderBlocked
                        ? "Clear search and Continue to reorder"
                        : "Drag to reorder (or press ↑/↓)"
                    }
                    aria-label={`Reorder ${item.title || item.url}`}
                    disabled={reorderBlocked}
                    onDragStart={(e) => {
                      if (reorderBlocked) {
                        e.preventDefault();
                        return;
                      }
                      setDragId(item.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        void handleMove(item.id, -1);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        void handleMove(item.id, 1);
                      }
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="9" cy="6" r="1.4" />
                      <circle cx="15" cy="6" r="1.4" />
                      <circle cx="9" cy="12" r="1.4" />
                      <circle cx="15" cy="12" r="1.4" />
                      <circle cx="9" cy="18" r="1.4" />
                      <circle cx="15" cy="18" r="1.4" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                type="button"
                className="relative w-20 flex-shrink-0 bg-black/40 cursor-pointer flex items-center justify-center rounded-l-lg overflow-hidden border-none"
                onClick={() =>
                  selectMode ? toggleSelect(item.id) : void handlePlay(item.url)
                }
                aria-label={
                  selectMode
                    ? `Select ${item.title || item.url}`
                    : `Play ${item.title || item.url}`
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
              </button>
              <button
                type="button"
                className="flex-1 flex items-center gap-2 px-2.5 py-2 cursor-pointer min-w-0 border-none bg-transparent text-left"
                aria-label={
                  selectMode
                    ? `Select ${item.title || item.url}`
                    : `Play ${item.title || item.url}`
                }
                onClick={() =>
                  selectMode ? toggleSelect(item.id) : void handlePlay(item.url)
                }
              >
                <div className="flex-1 min-w-0" title={item.url}>
                  <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                    <span className="text-sm font-medium text-text overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.title || host}
                    </span>
                    <LiveBadge status={item.liveStatus} />
                    <ShortBadge isShort={item.isShort} url={item.url} />
                  </div>
                  <div className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="text-accent">{host}</span>
                    <span className="text-muted">{path}</span>
                  </div>
                </div>
                {status && (
                  <div
                    className={`text-[11.5px] whitespace-nowrap flex-shrink-0 ${
                      item.completed ? "text-success" : "text-muted"
                    }`}
                  >
                    {status}
                  </div>
                )}
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
                    className="action-btn replay"
                    title="Play"
                    aria-label="Play"
                    onClick={() => void handlePlay(item.url)}
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
                    aria-label="Copy URL"
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="action-btn open"
                    title="Open in browser"
                    aria-label="Open in browser"
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
                    className="action-btn"
                    title="Refresh metadata"
                    aria-label="Refresh metadata"
                    disabled={refreshingId === item.id}
                    onClick={() => void handleRefresh(item.id)}
                  >
                    <svg
                      className={refreshingId === item.id ? "animate-spin" : ""}
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
                      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                  {(item.completed || (item.position ?? 0) > 0) && (
                    <button
                      type="button"
                      className="action-btn later"
                      title={
                        item.completed ? "Mark unwatched" : "Reset progress"
                      }
                      aria-label={
                        item.completed ? "Mark unwatched" : "Reset progress"
                      }
                      onClick={() => void handleResetProgress(item.id)}
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
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    className="action-btn delete"
                    title="Remove"
                    aria-label="Remove from Watch Later"
                    onClick={() => void handleDelete(item.id)}
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
                    className={`h-full ${
                      item.completed ? "bg-success" : "bg-accent"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })
      )}

      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}
