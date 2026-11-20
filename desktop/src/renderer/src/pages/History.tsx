import {
  type JSX,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isLiveLike, LiveBadge } from "../components/LiveBadge";
import { ShortBadge } from "../components/ShortBadge";
import { Thumbnail } from "../components/Thumbnail";
import type { HistoryEntry } from "../lib/api";
import {
  clearHistory,
  deleteHistory,
  getHistory,
  getPlayerStatus,
  getWatchLater,
  openExternal,
  queueUrl,
  replayUrl,
  restoreHistory,
  toggleWatchLater,
} from "../lib/api";
import { formatTime, hostOf } from "../lib/format";

type Filter = "all" | "progress" | "live" | "short";
type RowAction = "play" | "queue" | "save" | "copy" | "open" | "remove";
type ToastState = { msg: string; variant: string; undo?: () => void };

const HIDE_SHORTS_KEY = "ml-history-hide-shorts";

const GROUP_ORDER = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "This month",
  "Older",
];

const SHELF_LIMIT = 3;
const DELETE_UNDO_MS = 5000;
const TOAST_UNDO_MS = 4800;

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
  if (ts >= weekStart) return "Earlier this week";
  if (ts >= monthStart) return "This month";
  return "Older";
}

function rowTime(ts: number): string {
  const date = new Date(ts);
  const group = groupLabel(ts);
  if (group === "Today" || group === "Yesterday") {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (group === "Earlier this week") {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isProgressEntry(item: HistoryEntry): boolean {
  return !isLiveLike(item.liveStatus) && !item.completed && item.position > 0;
}

function isLiveNow(item: HistoryEntry): boolean {
  return item.liveStatus === "live" || item.liveStatus === "upcoming";
}

function progressPercent(item: HistoryEntry): number {
  const duration = item.duration ?? 0;
  if (duration <= 0 || item.position <= 0) return 0;
  return Math.min(
    99,
    Math.max(1, Math.round((item.position / duration) * 100)),
  );
}

function remainingSeconds(item: HistoryEntry): number {
  return Math.max(0, (item.duration ?? 0) - item.position);
}

function stateLabel(item: HistoryEntry): string {
  if (item.liveStatus === "live") return "Streaming now";
  if (item.liveStatus === "upcoming") return "Starts soon";
  if (item.liveStatus === "post_live" || item.liveStatus === "was_live") {
    return "Live ended";
  }
  if (item.completed) return "Finished";
  if (item.position > 0) {
    if ((item.duration ?? 0) > 0) {
      return `${progressPercent(item)}% watched · ${formatTime(
        remainingSeconds(item),
      )} left`;
    }
    return "Resume";
  }
  return "Not started";
}

export default function History({
  focusSignal = 0,
}: {
  focusSignal?: number;
}) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [canQueue, setCanQueue] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [hideShorts, setHideShorts] = useState(
    () => localStorage.getItem(HIDE_SHORTS_KEY) === "1",
  );
  const [toast, setToast] = useState<ToastState | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Row and bulk removals commit after a short undo window; pending ids stay
  // hidden from refreshes until the delayed delete finishes. Clear-all uses
  // the server's bulk clear plus a snapshot for its undo instead.
  const pendingRef = useRef<{
    ids: string[];
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const lastFocusRef = useRef(0);
  const mountedRef = useRef(true);

  const showToast = (
    msg: string,
    variant = "toast-success",
    undo?: () => void,
  ) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, variant, undo });
    toastTimerRef.current = setTimeout(
      () => {
        toastTimerRef.current = null;
        setToast(null);
      },
      undo ? TOAST_UNDO_MS : 2200,
    );
  };

  const hideToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  };

  const load = useCallback(async () => {
    try {
      const list = await getHistory();
      if (!mountedRef.current) return;
      setItems(list.filter((entry) => !pendingIdsRef.current.has(entry.id)));
      setLoadError(false);
    } catch {
      if (mountedRef.current) setLoadError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const commitDelete = async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteHistory(id)),
    );
    const failed = results.some((result) => result.status === "rejected");
    ids.forEach((id) => {
      pendingIdsRef.current.delete(id);
    });
    if (!mountedRef.current) return;
    if (failed) showToast("Could not remove some entries", "toast-error");
    void load();
  };

  const flushPending = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    void commitDelete(pending.ids);
  };

  const scheduleDelete = (ids: string[], message: string) => {
    if (ids.length === 0) return;
    flushPending();
    const unique = [...new Set(ids)];
    unique.forEach((id) => {
      pendingIdsRef.current.add(id);
    });
    const timer = setTimeout(() => {
      pendingRef.current = null;
      void commitDelete(unique);
    }, DELETE_UNDO_MS);
    pendingRef.current = { ids: unique, timer };
    showToast(message, "toast-success", () => {
      if (pendingRef.current?.timer === timer) {
        clearTimeout(timer);
        pendingRef.current = null;
      }
      unique.forEach((id) => {
        pendingIdsRef.current.delete(id);
      });
      void load();
    });
  };

  const baseItems = useMemo(
    () => (hideShorts ? items.filter((item) => !item.isShort) : items),
    [items, hideShorts],
  );
  const progressCount = useMemo(
    () => baseItems.filter(isProgressEntry).length,
    [baseItems],
  );
  const liveCount = useMemo(
    () => baseItems.filter(isLiveNow).length,
    [baseItems],
  );
  const shortCount = useMemo(
    () => items.filter((item) => item.isShort).length,
    [items],
  );
  const shelfItems = useMemo(
    () => baseItems.filter(isProgressEntry).slice(0, SHELF_LIMIT),
    [baseItems],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "short") {
        if (!item.isShort) return false;
      } else {
        if (hideShorts && item.isShort) return false;
        if (filter === "progress" && !isProgressEntry(item)) return false;
        if (filter === "live" && !isLiveNow(item)) return false;
      }
      if (!query) return true;
      return (
        item.title.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query)
      );
    });
  }, [items, filter, search, hideShorts]);
  const grouped = useMemo(() => {
    const buckets = new Map<string, HistoryEntry[]>();
    for (const item of filtered) {
      const label = groupLabel(item.timestamp);
      const bucket = buckets.get(label);
      if (bucket) bucket.push(item);
      else buckets.set(label, [item]);
    }
    return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
      label,
      entries: buckets.get(label) ?? [],
    }));
  }, [filtered]);

  const visibleProgressCount = filtered.filter(isProgressEntry).length;
  const visibleSelectedCount = filtered.filter((item) =>
    selected.has(item.id),
  ).length;
  const allSelected =
    filtered.length > 0 && visibleSelectedCount === filtered.length;
  const searchReady = items.length > 0;
  const showShelf =
    shelfItems.length > 0 &&
    filter === "all" &&
    search.trim().length === 0 &&
    !selectMode;
  const emptyActive = search.trim().length > 0 || filter !== "all";
  const hiddenByShorts =
    hideShorts &&
    filter === "all" &&
    search.trim().length === 0 &&
    filtered.length === 0 &&
    items.length > 0;
  const headerSub =
    loading && items.length === 0
      ? "Loading…"
      : loadError && items.length === 0
        ? "Can't reach the server"
        : `${filtered.length} ${
            filtered.length === 1 ? "entry" : "entries"
          } · ${visibleProgressCount} in progress`;
  const filterChips: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: baseItems.length },
    { value: "progress", label: "In progress", count: progressCount },
    { value: "live", label: "Live", count: liveCount },
    { value: "short", label: "Shorts", count: shortCount },
  ];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      const pending = pendingRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        pendingRef.current = null;
        void Promise.allSettled(
          pending.ids.map((id) => deleteHistory(id)),
        );
      }
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusSignal <= lastFocusRef.current || !searchReady) return;
    const input = searchRef.current;
    if (!input) return;
    lastFocusRef.current = focusSignal;
    input.focus();
  }, [focusSignal, searchReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menuId || pageMenuOpen) {
        setMenuId(null);
        setPageMenuOpen(false);
        return;
      }
      if (confirmingClear) {
        setConfirmingClear(false);
        return;
      }
      if (selectMode) {
        setSelected(new Set());
        setSelectMode(false);
        return;
      }
      if (search) {
        setSearch("");
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuId, pageMenuOpen, confirmingClear, selectMode, search]);

  useEffect(() => {
    if (!menuId && !pageMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (menuId && !target.closest(`[data-row-menu="${menuId}"]`)) {
        setMenuId(null);
      }
      if (pageMenuOpen && !target.closest("[data-page-menu]")) {
        setPageMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuId, pageMenuOpen]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        visibleSelectedCount > 0 && !allSelected;
    }
  }, [visibleSelectedCount, allSelected]);

  useEffect(() => {
    let cancelled = false;
    void getWatchLater()
      .then((entries) => {
        if (!cancelled) {
          setSavedUrls(new Set(entries.map((entry) => entry.url)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getPlayerStatus()
        .then((status) => {
          if (!cancelled) setCanQueue(Boolean(status.alive && status.ipcReady));
        })
        .catch(() => {
          if (!cancelled) setCanQueue(false);
        });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const hasPending = items.some(
      (entry) =>
        (!entry.title && !entry.thumbnail) ||
        (!entry.liveStatus && Date.now() - entry.timestamp < 60_000),
    );
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 3000);
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

  const retry = () => {
    setLoading(true);
    setLoadError(false);
    void load();
  };

  const changeFilter = (next: Filter) => {
    if (next === "short" && hideShorts) {
      setHideShorts(false);
      localStorage.setItem(HIDE_SHORTS_KEY, "0");
    }
    setFilter(next);
    setSelected(new Set());
    setMenuId(null);
    setPageMenuOpen(false);
  };

  const changeHideShorts = (value: boolean) => {
    setHideShorts(value);
    localStorage.setItem(HIDE_SHORTS_KEY, value ? "1" : "0");
    if (value && filter === "short") setFilter("all");
    setSelected(new Set());
    setPageMenuOpen(false);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setSelected(new Set());
  };

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
    setSelected(new Set());
  };

  const enterSelectMode = () => {
    setConfirmingClear(false);
    setMenuId(null);
    setPageMenuOpen(false);
    setSelected(new Set());
    setSelectMode(true);
  };

  const exitSelectMode = () => {
    setSelected(new Set());
    setSelectMode(false);
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
      allSelected ? new Set() : new Set(filtered.map((item) => item.id)),
    );
  };

  const handlePlay = async (item: HistoryEntry) => {
    const res = await replayUrl(item.url);
    if (!res.success) {
      showToast(`Error: ${res.error ?? "Could not play URL"}`, "toast-error");
      return;
    }
    showToast("Playing…");
    void load();
  };

  const handleQueue = async (item: HistoryEntry) => {
    if (!canQueue) {
      showToast("Start a video before queueing", "toast-error");
      return;
    }
    const res = await queueUrl(item.url);
    if (!res.success) {
      showToast(`Error: ${res.error ?? "Could not queue URL"}`, "toast-error");
      return;
    }
    showToast("Added to queue");
    void load();
  };

  const handleToggleSave = async (item: HistoryEntry) => {
    try {
      const result = await toggleWatchLater(
        item.url,
        item.title,
        item.thumbnail,
      );
      setSavedUrls((prev) => {
        const next = new Set(prev);
        if (result.saved) next.add(item.url);
        else next.delete(item.url);
        return next;
      });
      showToast(
        result.saved ? "Saved to Watch Later" : "Removed from Watch Later",
      );
    } catch {
      showToast("Could not update Watch Later", "toast-error");
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Copied");
    } catch {
      showToast("Could not copy URL", "toast-error");
    }
  };

  const handleOpen = (url: string) => {
    void openExternal(url).catch(() => {
      showToast("Could not open browser", "toast-error");
    });
  };

  const handleRemove = (item: HistoryEntry) => {
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    scheduleDelete([item.id], "Removed from history");
  };

  const handleDeleteSelected = () => {
    const ids = filtered
      .filter((item) => selected.has(item.id))
      .map((item) => item.id);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((entry) => !idSet.has(entry.id)));
    setSelected(new Set());
    setSelectMode(false);
    scheduleDelete(
      ids,
      ids.length === 1 ? "1 entry removed" : `${ids.length} entries removed`,
    );
  };

  const handleClear = async () => {
    const snapshot = items;
    setConfirmingClear(false);
    try {
      await clearHistory();
    } catch {
      showToast("Could not clear history", "toast-error");
      return;
    }
    setItems([]);
    setSelected(new Set());
    setSelectMode(false);
    setSearch("");
    setFilter("all");
    showToast("History cleared", "toast-success", () => {
      void restoreHistory(snapshot)
        .then(() => load())
        .catch(() => showToast("Could not restore history", "toast-error"));
    });
  };

  const openClearConfirm = () => {
    setPageMenuOpen(false);
    setMenuId(null);
    setSelectMode(false);
    setSelected(new Set());
    setConfirmingClear(true);
  };

  const toggleRowMenu = (
    item: HistoryEntry,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (menuId === item.id) {
      setMenuId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuUp(window.innerHeight - rect.bottom < 260);
    setPageMenuOpen(false);
    setMenuId(item.id);
  };

  const runRowAction = (action: RowAction, item: HistoryEntry) => {
    setMenuId(null);
    if (action === "play") {
      void handlePlay(item);
      return;
    }
    if (action === "queue") {
      void handleQueue(item);
      return;
    }
    if (action === "save") {
      void handleToggleSave(item);
      return;
    }
    if (action === "copy") {
      void handleCopy(item.url);
      return;
    }
    if (action === "open") {
      handleOpen(item.url);
      return;
    }
    handleRemove(item);
  };

  const handleUndo = () => {
    const undo = toast?.undo;
    hideToast();
    undo?.();
  };

  return (
    <div className="pb-4">
      <div className="mb-3">
        <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text">
          History
        </h1>
        <p className="mt-0.5 text-xs tabular-nums text-muted">{headerSub}</p>
      </div>

      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[172px] flex-1 basis-[250px]">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon className="h-[15px] w-[15px]" />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Search history"
              aria-label="Search history"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-16 text-[13px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
            {search ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
                aria-label="Clear search"
                onClick={() => changeSearch("")}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-elevated px-1.5 py-0.5 text-[10.5px] font-medium text-muted min-[480px]:inline-flex">
                Ctrl F
              </span>
            )}
          </div>

          <fieldset className="order-3 m-0 flex w-full min-w-0 flex-none gap-0.5 rounded-[9px] border border-border bg-surface p-0.5 max-[420px]:gap-0 min-[620px]:order-none min-[620px]:w-auto">
            <legend className="sr-only">Filter history</legend>
            {filterChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                aria-pressed={filter === chip.value}
                className={`inline-flex h-[26px] flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-[11.5px] font-medium transition-colors max-[420px]:px-1 max-[420px]:text-[10.5px] min-[620px]:flex-none ${
                  filter === chip.value
                    ? "bg-elevated text-text"
                    : "text-muted hover:text-text"
                }`}
                onClick={() => changeFilter(chip.value)}
              >
                {chip.label}
                <span
                  className={`text-[11px] tabular-nums max-[420px]:hidden ${
                    filter === chip.value ? "text-text-dim" : "text-muted"
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            ))}
          </fieldset>

          <button
            type="button"
            className="btn-ghost flex-shrink-0"
            onClick={enterSelectMode}
          >
            <SelectIcon />
            Select
          </button>

          <div className="relative flex-none" data-page-menu>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-text"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={pageMenuOpen}
              onClick={() => {
                setPageMenuOpen((open) => !open);
                setMenuId(null);
              }}
            >
              <MoreIcon className="h-4 w-4" />
            </button>
            {pageMenuOpen && (
              <div
                role="menu"
                aria-label="History actions"
                className="absolute right-0 z-40 mt-1 w-[190px] rounded-[10px] border border-border-strong bg-card p-1 shadow-xl"
              >
                <MenuItem
                  icon={<ShortsIcon />}
                  label="Hide Shorts & Reels"
                  checked={hideShorts}
                  onClick={() => changeHideShorts(!hideShorts)}
                />
                <div className="my-1 h-px bg-border" />
                <MenuItem
                  icon={<TrashIcon />}
                  label="Clear history"
                  danger
                  disabled={items.length === 0}
                  onClick={openClearConfirm}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {confirmingClear && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2"
          role="alert"
        >
          <span className="flex-1 text-xs leading-snug text-text-dim">
            Clear all {items.length} {items.length === 1 ? "entry" : "entries"}?
            You can undo this right after.
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

      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <span
            className="text-xs font-medium text-text"
            aria-live="polite"
          >
            <span className="tabular-nums">{visibleSelectedCount}</span>{" "}
            selected
          </span>
          <span className="flex-1" />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-text-dim">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            Select all
          </label>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={exitSelectMode}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger btn-sm disabled:opacity-40"
            disabled={visibleSelectedCount === 0}
            onClick={handleDeleteSelected}
          >
            Remove
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <HistorySkeleton />
      ) : loadError && items.length === 0 ? (
        <HistoryOffline onRetry={retry} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <span className="mb-2.5 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted">
            <HistoryIcon className="h-[18px] w-[18px]" />
          </span>
          <p className="text-[13px] font-medium text-text">
            {hiddenByShorts
              ? "Shorts and Reels are hidden"
              : emptyActive
                ? "No matches"
                : "No history yet"}
          </p>
          <p className="mt-1 max-w-[300px] text-[11.5px] leading-relaxed text-muted">
            {hiddenByShorts
              ? "Show short-form videos to see them in your history."
              : emptyActive
                ? "Try a different search or filter."
                : "Play a video from your browser and it will show up here."}
          </p>
          {hiddenByShorts ? (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={() => changeHideShorts(false)}
            >
              Show Shorts & Reels
            </button>
          ) : emptyActive ? (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {showShelf && (
            <section className="mb-1 mt-1">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-text">
                  Continue watching
                </h2>
                <span className="text-[11px] tabular-nums text-muted">
                  {progressCount} unfinished
                </span>
                <button
                  type="button"
                  className="ml-auto flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
                  onClick={() => changeFilter("progress")}
                >
                  See all
                  <ChevronRightIcon className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1.5 min-[621px]:grid-cols-3 min-[621px]:gap-2.5">
                {shelfItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="group block overflow-hidden rounded-[11px] border border-border bg-card text-left transition-colors hover:border-border-strong max-[620px]:grid max-[620px]:grid-cols-[96px_minmax(0,1fr)] max-[620px]:items-stretch"
                    aria-label={`Resume ${item.title || item.url}`}
                    title={item.title || item.url}
                    onClick={() => void handlePlay(item)}
                  >
                    <span className="relative block aspect-video w-full overflow-hidden bg-black max-[620px]:aspect-auto max-[620px]:h-full max-[620px]:w-24">
                      <Thumbnail
                        src={item.thumbnail}
                        className="absolute inset-0 h-full w-full object-cover"
                        fallback={
                          <span className="grid h-full w-full place-items-center text-white/15">
                            <PlayIcon className="h-5 w-5" />
                          </span>
                        }
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-black shadow-lg">
                          <PlayFillIcon className="ml-0.5 h-3.5 w-3.5" />
                        </span>
                      </span>
                      {(item.duration ?? 0) > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[11px] tabular-nums text-white">
                          {formatTime(item.duration ?? 0)}
                        </span>
                      )}
                      <span
                        className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/25"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${progressPercent(item)}%` }}
                        />
                      </span>
                    </span>
                    <span className="flex flex-col justify-center p-2.5 max-[620px]:py-1.5">
                      <span className="line-clamp-2 min-h-[34px] text-[12.5px] font-medium leading-[1.35] text-text max-[620px]:line-clamp-1 max-[620px]:min-h-0">
                        {item.title || item.url}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
                        <span className="truncate text-accent">
                          {hostOf(item.url)}
                        </span>
                        <span className="text-muted/50">·</span>
                        <span className="truncate">
                          {formatTime(remainingSeconds(item))} left
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {grouped.map((group) => (
            <div key={group.label}>
              <div className="mb-1 mt-3 flex items-center gap-2 px-1">
                <span className="text-xs font-semibold text-text-dim">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] tabular-nums text-muted">
                  {group.entries.length}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {group.entries.map((item) => {
                  const progress = progressPercent(item);
                  const inProgress = isProgressEntry(item);
                  const saved = savedUrls.has(item.url);
                  const liveLabel =
                    item.liveStatus === "live"
                      ? "LIVE"
                      : item.liveStatus === "upcoming"
                        ? "SOON"
                        : "";
                  return (
                    <div
                      key={item.id}
                      className="group flex min-h-[72px] items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-card min-[560px]:gap-3"
                    >
                      {selectMode && (
                        <label className="flex flex-none cursor-pointer items-center pl-0.5">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            aria-label={`Select ${item.title || item.url}`}
                          />
                        </label>
                      )}

                      <button
                        type="button"
                        className="relative aspect-video w-[88px] flex-none overflow-hidden rounded-lg bg-black min-[560px]:w-[104px]"
                        aria-label={
                          selectMode
                            ? `Select ${item.title || item.url}`
                            : `${inProgress ? "Resume" : "Play"} ${
                                item.title || item.url
                              }`
                        }
                        onClick={() =>
                          selectMode
                            ? toggleSelect(item.id)
                            : void handlePlay(item)
                        }
                      >
                        <Thumbnail
                          src={item.thumbnail}
                          className={`absolute inset-0 h-full w-full object-cover ${
                            item.completed
                              ? "opacity-60 saturate-50"
                              : ""
                          }`}
                          fallback={
                            <span className="grid h-full w-full place-items-center text-white/15">
                              <PlayIcon className="h-5 w-5" />
                            </span>
                          }
                        />
                        {item.completed && (
                          <span className="absolute left-1.5 top-1.5 z-[2] grid h-5 w-5 place-items-center rounded-full bg-black/60 text-accent">
                            <CheckIcon className="h-3 w-3" />
                          </span>
                        )}
                        <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-black shadow-lg">
                            <PlayFillIcon className="ml-0.5 h-3.5 w-3.5" />
                          </span>
                        </span>
                        {liveLabel ? (
                          <span
                            className={`absolute bottom-1.5 right-1.5 z-[2] rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-white ${
                              item.liveStatus === "live"
                                ? "bg-red-500"
                                : "bg-amber-500"
                            }`}
                          >
                            {liveLabel}
                          </span>
                        ) : (item.duration ?? 0) > 0 ? (
                          <span className="absolute bottom-1.5 right-1.5 z-[2] rounded bg-black/70 px-1 py-0.5 text-[11px] tabular-nums text-white">
                            {formatTime(item.duration ?? 0)}
                          </span>
                        ) : null}
                        {inProgress && (
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

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <button
                          type="button"
                          className={`block max-w-full truncate text-left text-[13.5px] font-medium leading-[1.3] ${
                            item.completed ? "text-text-dim" : "text-text"
                          } hover:text-accent`}
                          title={item.title || item.url}
                          onClick={() =>
                            selectMode
                              ? toggleSelect(item.id)
                              : void handlePlay(item)
                          }
                        >
                          {item.title || item.url}
                        </button>
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px] text-muted">
                          {item.isShort && (
                            <ShortBadge isShort url={item.url} />
                          )}
                          {item.liveStatus && item.liveStatus !== "none" && (
                            <LiveBadge status={item.liveStatus} />
                          )}
                          {item.completed && <WatchedBadge />}
                          <span className="truncate text-accent">
                            {hostOf(item.url)}
                          </span>
                          <span className="flex-none text-muted/50">·</span>
                          <span className="truncate">{stateLabel(item)}</span>
                        </div>
                      </div>

                      <div className="flex flex-none items-center gap-0.5">
                        <span
                          className="hidden w-[52px] text-right text-[11px] tabular-nums text-muted min-[780px]:block"
                          title={timeLabel(item.timestamp)}
                        >
                          {rowTime(item.timestamp)}
                        </span>
                        {!selectMode && (
                          <>
                            <button
                              type="button"
                              className={`flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors hover:bg-elevated ${
                                saved
                                  ? "text-accent"
                                  : "text-muted opacity-50 group-hover:opacity-100 hover:text-accent"
                              }`}
                              aria-label={
                                saved
                                  ? "Remove from Watch Later"
                                  : "Save to Watch Later"
                              }
                              aria-pressed={saved}
                              title={
                                saved
                                  ? "Remove from Watch Later"
                                  : "Save to Watch Later"
                              }
                              onClick={() => void handleToggleSave(item)}
                            >
                              <BookmarkIcon
                                filled={saved}
                                className="h-[15px] w-[15px]"
                              />
                            </button>
                            <div
                              className="relative flex-none"
                              data-row-menu={item.id}
                            >
                              <button
                                type="button"
                                className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
                                aria-label="More options"
                                aria-haspopup="menu"
                                aria-expanded={menuId === item.id}
                                onClick={(event) =>
                                  toggleRowMenu(item, event)
                                }
                              >
                                <MoreIcon className="h-[15px] w-[15px]" />
                              </button>
                              {menuId === item.id && (
                                <RowMenu
                                  saved={saved}
                                  canQueue={canQueue}
                                  up={menuUp}
                                  onAction={(action) =>
                                    runRowAction(action, item)
                                  }
                                />
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {toast && (
        <div
          className={`toast ${toast.variant} flex items-center gap-3`}
          role="status"
          aria-live="polite"
        >
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              className="flex-none font-semibold text-accent hover:underline"
              onClick={handleUndo}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WatchedBadge() {
  return (
    <span className="inline-flex h-4 flex-none items-center rounded bg-muted/15 px-1.5 text-[9px] font-bold uppercase tracking-[0.05em] text-muted">
      Watched
    </span>
  );
}

function RowMenu({
  saved,
  canQueue,
  up,
  onAction,
}: {
  saved: boolean;
  canQueue: boolean;
  up: boolean;
  onAction: (action: RowAction) => void;
}): JSX.Element {
  return (
    <div
      role="menu"
      aria-label="History entry actions"
      className={`absolute right-0 z-40 w-[190px] rounded-[10px] border border-border-strong bg-card p-1 shadow-xl ${
        up ? "bottom-full mb-1" : "top-full mt-1"
      }`}
    >
      <MenuItem
        icon={<PlayIcon />}
        label="Play now"
        onClick={() => onAction("play")}
      />
      <MenuItem
        icon={<QueueIcon />}
        label="Add to queue"
        disabled={!canQueue}
        hint={canQueue ? undefined : "Start a video before queueing"}
        onClick={() => onAction("queue")}
      />
      <MenuItem
        icon={<BookmarkIcon filled={saved} />}
        label={saved ? "Remove from Watch Later" : "Save to Watch Later"}
        onClick={() => onAction("save")}
      />
      <MenuItem
        icon={<CopyIcon />}
        label="Copy URL"
        onClick={() => onAction("copy")}
      />
      <MenuItem
        icon={<ExternalIcon />}
        label="Open in browser"
        onClick={() => onAction("open")}
      />
      <div className="my-1 h-px bg-border" />
      <MenuItem
        icon={<TrashIcon />}
        label="Remove from history"
        danger
        onClick={() => onAction("remove")}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
  hint,
  checked,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  checked?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      {...(checked === undefined ? {} : { "aria-checked": checked })}
      disabled={disabled}
      title={hint}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs transition-colors disabled:cursor-default disabled:opacity-40 ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-text-dim hover:bg-elevated hover:text-text"
      }`}
    >
      <span
        className={`flex h-4 w-4 flex-none items-center justify-center ${
          danger ? "text-danger" : "text-muted"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked && (
        <span className="flex h-4 w-4 flex-none items-center justify-center text-accent">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

function HistorySkeleton() {
  const widths = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"];
  return (
    <div
      className="flex flex-col gap-2 pt-2"
      role="status"
      aria-label="Loading history"
    >
      {widths.map((width) => (
        <div key={width} className="flex items-stretch gap-2.5 px-2">
          <div className="aspect-video w-[88px] flex-none animate-pulse rounded-lg bg-elevated min-[560px]:w-[104px]" />
          <div className="flex flex-1 flex-col justify-center gap-2 py-2">
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
    <div className="px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
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
      <p className="m-0 text-sm font-medium text-text">
        Can't reach the server
      </p>
      <p className="mx-auto mb-0 mt-1.5 max-w-xs text-xs text-muted">
        The local server may still be starting. Your history is stored on this
        machine.
      </p>
      <button type="button" className="btn-primary mt-4" onClick={onRetry}>
        Retry
      </button>
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

function SearchIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
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

function SelectIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="m3 5 1.5 1.5L7 4" />
      <path d="m3 11 1.5 1.5L7 10" />
      <path d="m3 17 1.5 1.5L7 16" />
      <path d="M11 5h10M11 11h10M11 17h10" />
    </Icon>
  );
}

function MoreIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.5" />
    </Icon>
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

function BookmarkIcon({
  className,
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}): JSX.Element {
  return (
    <Icon className={className}>
      <path
        d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
        fill={filled ? "currentColor" : "none"}
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

function CopyIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

function ExternalIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Icon>
  );
}

function TrashIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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

function ShortsIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="m10.5 8 4.5 3-4.5 3z" />
    </Icon>
  );
}

function HistoryIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}
