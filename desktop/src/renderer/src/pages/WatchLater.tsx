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
import { formatTime, hostOf, relativeTime } from "../lib/format";

type SortMode = "newest" | "oldest" | "title" | "custom";
type Filter = "all" | "progress" | "short";
type RowAction =
  | "play"
  | "queue"
  | "copy"
  | "open"
  | "refresh"
  | "reset"
  | "moveUp"
  | "moveDown"
  | "remove";
type ToastState = { msg: string; variant: string; undo?: () => void };

const SORT_KEY = "ml-later-sort";
const CONTINUE_KEY = "ml-later-continue";
const HIDE_SHORTS_KEY = "ml-later-hide-shorts";

const DELETE_UNDO_MS = 5000;
const TOAST_UNDO_MS = 4800;
const MENU_UP_THRESHOLD = 340;

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

function isInProgress(item: WatchLaterEntry): boolean {
  return !isLiveLike(item.liveStatus) && !item.completed && (item.position ?? 0) > 0;
}

function progressPercent(item: WatchLaterEntry): number {
  const duration = item.duration ?? 0;
  const position = item.position ?? 0;
  if (duration <= 0 || position <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round((position / duration) * 100)));
}

function remainingSeconds(item: WatchLaterEntry): number {
  return Math.max(0, (item.duration ?? 0) - (item.position ?? 0));
}

function stateLabel(item: WatchLaterEntry): string {
  if (item.liveStatus === "live") return "Streaming now";
  if (item.liveStatus === "upcoming") return "Starts soon";
  if (item.liveStatus === "post_live" || item.liveStatus === "was_live") {
    return "Live ended";
  }
  if (item.completed) return "Watched";
  if ((item.position ?? 0) > 0) {
    if ((item.duration ?? 0) > 0) {
      return `${progressPercent(item)}% watched · ${formatTime(
        remainingSeconds(item),
      )} left`;
    }
    return "Resume";
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
  const [filter, setFilter] = useState<Filter>(() =>
    localStorage.getItem(CONTINUE_KEY) === "1" ? "progress" : "all",
  );
  const [sort, setSort] = useState<SortMode>(() => {
    const stored = localStorage.getItem(SORT_KEY);
    return stored === "oldest" || stored === "title" || stored === "custom"
      ? stored
      : "newest";
  });
  const [hideShorts, setHideShorts] = useState(
    () => localStorage.getItem(HIDE_SHORTS_KEY) === "1",
  );
  const [watchedOpen, setWatchedOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [canQueue, setCanQueue] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Row and bulk removals commit after a short undo window; pending ids stay
  // hidden from refreshes until the delayed delete finishes.
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

  const applyList = useCallback((list: WatchLaterEntry[]) => {
    setItems(list.filter((entry) => !pendingIdsRef.current.has(entry.id)));
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await getWatchLater();
      if (!mountedRef.current) return;
      applyList(list);
      setLoadError(false);
    } catch {
      if (mountedRef.current) setLoadError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyList]);

  const commitDelete = async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteWatchLater(id)),
    );
    const failed = results.some((result) => result.status === "rejected");
    ids.forEach((id) => {
      pendingIdsRef.current.delete(id);
    });
    if (!mountedRef.current) return;
    if (failed) showToast("Could not remove some videos", "toast-error");
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
    () => baseItems.filter(isInProgress).length,
    [baseItems],
  );
  const shortCount = useMemo(
    () => items.filter((item) => item.isShort).length,
    [items],
  );
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        !query ||
        item.url.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query),
    );
  }, [items, search]);
  const visible = useMemo(() => {
    let list = searched;
    if (filter === "short") {
      list = list.filter((item) => item.isShort);
    } else {
      if (hideShorts) list = list.filter((item) => !item.isShort);
      if (filter === "progress") list = list.filter(isInProgress);
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
  }, [searched, filter, hideShorts, sort]);

  const activeRows = visible.filter((item) => !item.completed);
  const watchedRows = visible.filter((item) => item.completed);
  const groupWatched = sort !== "custom";
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

  const visibleProgressCount = visible.filter(isInProgress).length;
  const reorderBlocked =
    Boolean(search.trim()) || filter !== "all" || hideShorts;
  const searchReady = items.length > 0;
  const hiddenByShorts =
    hideShorts &&
    filter === "all" &&
    search.trim().length === 0 &&
    visible.length === 0 &&
    items.length > 0;
  const headerSub =
    loading && items.length === 0
      ? "Loading…"
      : loadError && items.length === 0
        ? "Can't reach the server"
        : `${visible.length} saved · ${visibleProgressCount} in progress`;
  const filterChips: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: baseItems.length },
    { value: "progress", label: "In progress", count: progressCount },
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
          pending.ids.map((id) => deleteWatchLater(id)),
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
        selectedIds.length > 0 && !allSelected;
    }
  }, [selectedIds.length, allSelected]);

  // yt-dlp enrichment can lag behind the save; keep polling while an entry
  // lacks metadata or a recent entry's live status is still unknown.
  useEffect(() => {
    if (
      !items.some(
        (entry) =>
          (!entry.title && !entry.thumbnail) ||
          (!entry.liveStatus && Date.now() - entry.addedAt < 60_000),
      )
    ) {
      return;
    }
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [items, load]);

  // Live statuses change while a stream is running; the server refreshes them
  // on list reads, and this poll picks up the result.
  useEffect(() => {
    if (!items.some((entry) => isLiveLike(entry.liveStatus))) return;
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [items, load]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      void getPlayerStatus()
        .then((status) => {
          if (!cancelled) setCanQueue(Boolean(status.alive && status.ipcReady));
        })
        .catch(() => {
          if (!cancelled) setCanQueue(false);
        });
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    void load();
  };

  const changeSort = (value: SortMode) => {
    setSort(value);
    localStorage.setItem(SORT_KEY, value);
    setSelected(new Set());
    setMenuId(null);
    setPageMenuOpen(false);
  };

  const changeFilter = (next: Filter) => {
    if (next === "short" && hideShorts) {
      setHideShorts(false);
      localStorage.setItem(HIDE_SHORTS_KEY, "0");
    }
    setFilter(next);
    localStorage.setItem(CONTINUE_KEY, next === "progress" ? "1" : "0");
    setSelected(new Set());
    setMenuId(null);
    setPageMenuOpen(false);
  };

  const changeHideShorts = (value: boolean) => {
    setHideShorts(value);
    localStorage.setItem(HIDE_SHORTS_KEY, value ? "1" : "0");
    if (value && filter === "short") {
      setFilter("all");
      localStorage.setItem(CONTINUE_KEY, "0");
    }
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
    localStorage.setItem(CONTINUE_KEY, "0");
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
      allSelected
        ? new Set()
        : new Set(selectableRows.map((item) => item.id)),
    );
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

  const handleRemove = (item: WatchLaterEntry) => {
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    scheduleDelete([item.id], "Removed from Watch Later");
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const ids = [...selectedIds];
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((entry) => !idSet.has(entry.id)));
    setSelected(new Set());
    setSelectMode(false);
    scheduleDelete(
      ids,
      ids.length === 1
        ? "1 video removed"
        : `${ids.length} videos removed`,
    );
  };

  const handleClear = async () => {
    setConfirmingClear(false);
    try {
      await clearWatchLater();
    } catch {
      showToast("Could not clear Watch Later", "toast-error");
      return;
    }
    setItems([]);
    setSelected(new Set());
    setSelectMode(false);
    setSearch("");
    setFilter("all");
    setWatchedOpen(false);
    localStorage.setItem(CONTINUE_KEY, "0");
    showToast("Watch Later cleared");
  };

  const openClearConfirm = () => {
    setPageMenuOpen(false);
    setMenuId(null);
    setSelectMode(false);
    setSelected(new Set());
    setConfirmingClear(true);
  };

  const handleRefresh = async (id: string) => {
    if (refreshingId) return;
    setRefreshingId(id);
    showToast("Refreshing metadata…");
    try {
      applyList(await refreshWatchLater(id));
      showToast("Metadata refreshed");
    } catch {
      showToast("Could not refresh metadata", "toast-error");
    } finally {
      setRefreshingId(null);
    }
  };

  const handleResetProgress = async (id: string) => {
    try {
      applyList(await resetWatchLaterProgress(id));
      showToast("Marked unwatched");
    } catch {
      showToast("Could not reset progress", "toast-error");
    }
  };

  const persistOrder = async (ids: string[]) => {
    try {
      applyList(await reorderWatchLater(ids));
      showToast("Order updated");
    } catch {
      showToast("Could not reorder Watch Later", "toast-error");
    }
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    if (sort !== "custom" || reorderBlocked) return;
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
    if (sort !== "custom" || reorderBlocked) return;
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

  const toggleRowMenu = (
    item: WatchLaterEntry,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (menuId === item.id) {
      setMenuId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuUp(window.innerHeight - rect.bottom < MENU_UP_THRESHOLD);
    setPageMenuOpen(false);
    setMenuId(item.id);
  };

  const runRowAction = (action: RowAction, item: WatchLaterEntry) => {
    setMenuId(null);
    if (action === "play") {
      void handlePlay(item.url);
      return;
    }
    if (action === "queue") {
      void handleQueue(item.url);
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
    if (action === "refresh") {
      void handleRefresh(item.id);
      return;
    }
    if (action === "reset") {
      void handleResetProgress(item.id);
      return;
    }
    if (action === "moveUp") {
      void handleMove(item.id, -1);
      return;
    }
    if (action === "moveDown") {
      void handleMove(item.id, 1);
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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text">
            Watch Later
          </h1>
          <p className="mt-0.5 text-xs tabular-nums text-muted">{headerSub}</p>
        </div>
        {!selectMode && activeRows.length > 0 && (
          <button
            type="button"
            className="btn-primary btn-sm flex-shrink-0"
            title="Play every unwatched video currently listed"
            onClick={() =>
              void handlePlayMany(activeRows.map((item) => item.id))
            }
          >
            <PlayIcon className="h-3.5 w-3.5" />
            Play all
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[160px] flex-1 basis-[190px]">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon className="h-[15px] w-[15px]" />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Search Watch Later"
              aria-label="Search Watch Later"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-16 text-[13px] text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
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
                Ctrl 3
              </span>
            )}
          </div>

          <fieldset className="order-3 m-0 flex w-full min-w-0 flex-none gap-0.5 rounded-[9px] border border-border bg-surface p-0.5 max-[420px]:gap-0 min-[620px]:order-none min-[620px]:w-auto">
            <legend className="sr-only">Filter Watch Later</legend>
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

          <select
            className="select h-9 flex-none cursor-pointer rounded-lg border border-border bg-surface pl-2.5 pr-8 text-[12px] text-text outline-none transition-colors focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
            value={sort}
            onChange={(event) => changeSort(event.target.value as SortMode)}
            aria-label="Sort Watch Later"
          >
            <option value="newest">Newest saved</option>
            <option value="oldest">Oldest saved</option>
            <option value="title">Title A–Z</option>
            <option value="custom">Custom order</option>
          </select>

          {!selectMode && (
            <button
              type="button"
              className="btn-ghost h-9 flex-shrink-0"
              onClick={enterSelectMode}
            >
              <SelectIcon />
              Select
            </button>
          )}

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
                aria-label="Watch Later actions"
                className="absolute right-0 z-40 mt-1 w-[200px] rounded-[10px] border border-border-strong bg-card p-1 shadow-xl"
              >
                {!selectMode && (
                  <MenuItem
                    icon={<QueueIcon />}
                    label="Queue all"
                    disabled={!canQueue || activeRows.length === 0}
                    hint={
                      canQueue
                        ? "Queue every unwatched video currently listed"
                        : "Start a video before queueing"
                    }
                    onClick={() => {
                      setPageMenuOpen(false);
                      void handleQueueMany(activeRows.map((item) => item.id));
                    }}
                  />
                )}
                <MenuItem
                  icon={<ShortsIcon />}
                  label="Hide Shorts & Reels"
                  checked={hideShorts}
                  onClick={() => changeHideShorts(!hideShorts)}
                />
                <div className="my-1 h-px bg-border" />
                <MenuItem
                  icon={<UploadIcon />}
                  label="Import from JSON"
                  onClick={() => {
                    setPageMenuOpen(false);
                    void handleImport();
                  }}
                />
                <MenuItem
                  icon={<DownloadIcon />}
                  label="Export to JSON"
                  onClick={() => {
                    setPageMenuOpen(false);
                    void handleExport();
                  }}
                />
                <div className="my-1 h-px bg-border" />
                <MenuItem
                  icon={<TrashIcon />}
                  label="Clear Watch Later"
                  danger
                  disabled={items.length === 0}
                  onClick={openClearConfirm}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {sort === "custom" && items.length > 0 && (
        <div className="mb-2 mt-1 px-1 text-[11px] text-muted">
          {reorderBlocked
            ? "Clear search and filters to reorder."
            : "Custom order — drag rows or use ↑/↓ to reorder."}
        </div>
      )}

      {confirmingClear && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2"
          role="alert"
        >
          <span className="flex-1 text-xs leading-snug text-text-dim">
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

      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <span className="text-xs font-medium text-text" aria-live="polite">
            <span className="tabular-nums">{selectedIds.length}</span> selected
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
            className="btn-primary btn-sm disabled:opacity-40"
            disabled={selectedIds.length === 0}
            onClick={() => void handlePlayMany(selectedIds)}
          >
            Play
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm disabled:opacity-40"
            disabled={!canQueue || selectedIds.length === 0}
            onClick={() => void handleQueueMany(selectedIds)}
          >
            Queue
          </button>
          <button
            type="button"
            className="btn-danger btn-sm disabled:opacity-40"
            disabled={selectedIds.length === 0}
            onClick={handleDeleteSelected}
          >
            Remove
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={exitSelectMode}
          >
            Cancel
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <WatchLaterSkeleton />
      ) : loadError && items.length === 0 ? (
        <WatchLaterOffline onRetry={retry} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <span className="mb-2.5 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted">
            <BookmarkIcon className="h-[18px] w-[18px]" />
          </span>
          <p className="text-[13px] font-medium text-text">
            {search
              ? "No matches"
              : items.length === 0
                ? "Nothing saved yet"
                : hiddenByShorts
                  ? "Shorts and Reels are hidden"
                  : filter === "progress"
                    ? "Nothing in progress"
                    : "No matches"}
          </p>
          <p className="mt-1 max-w-[300px] text-[11.5px] leading-relaxed text-muted">
            {search
              ? "Try a different search or filter."
              : items.length === 0
                ? "Save videos with the browser extension or from the Play page."
                : hiddenByShorts
                  ? "Show short-form videos to see them in your saved list."
                  : filter === "progress"
                    ? "Saved videos you've started will appear here."
                    : "Try a different search or filter."}
          </p>
          {search || filter !== "all" ? (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={
                filter === "progress" && !search
                  ? () => changeFilter("all")
                  : resetFilters
              }
            >
              {filter === "progress" && !search
                ? "Show all videos"
                : "Reset filters"}
            </button>
          ) : items.length === 0 ? (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={() => void handleImport()}
            >
              Import from JSON
            </button>
          ) : hiddenByShorts ? (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={() => changeHideShorts(false)}
            >
              Show Shorts & Reels
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          {rows.map((row) => {
            if (row.kind === "watched-header") {
              return (
                <button
                  key="watched-header"
                  type="button"
                  aria-expanded={watchedOpen}
                  className="mb-1 mt-3 flex w-full items-center gap-2 px-1 text-xs font-semibold text-text-dim transition-colors hover:text-text"
                  onClick={() => setWatchedOpen((open) => !open)}
                >
                  <ChevronDownIcon
                    className={`h-3.5 w-3.5 transition-transform ${
                      watchedOpen ? "" : "-rotate-90"
                    }`}
                  />
                  <span>Watched</span>
                  <span className="text-[11px] font-normal tabular-nums text-muted">
                    {row.count}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </button>
              );
            }
            const item = row.item;
            const progress = progressPercent(item);
            const inProgress = isInProgress(item);
            const completed = Boolean(item.completed);
            const liveLabel =
              item.liveStatus === "live"
                ? "LIVE"
                : item.liveStatus === "upcoming"
                  ? "SOON"
                  : "";
            const resetLabel = completed
              ? "Mark unwatched"
              : (item.position ?? 0) > 0
                ? "Reset progress"
                : null;
            const customIndex =
              sort === "custom"
                ? items.findIndex((entry) => entry.id === item.id)
                : -1;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: the row is a drop target; the drag handle provides keyboard reordering
              <div
                key={item.id}
                className={`group relative mb-0.5 flex min-h-[72px] items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-card min-[560px]:gap-3 ${
                  selectMode && selected.has(item.id) ? "bg-card" : ""
                } ${
                  dragOverId === item.id && dragId !== item.id
                    ? "ring-2 ring-inset ring-accent/60"
                    : ""
                }`}
                onDragOver={(event) => {
                  if (sort !== "custom" || selectMode || reorderBlocked) {
                    return;
                  }
                  event.preventDefault();
                  if (dragId && dragId !== item.id) setDragOverId(item.id);
                }}
                onDrop={(event) => {
                  if (sort !== "custom" || selectMode) return;
                  event.preventDefault();
                  void handleDrop(
                    item.id,
                    event.dataTransfer.getData("text/plain"),
                  );
                }}
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

                {sort === "custom" && !selectMode && (
                  <div className="flex flex-none items-center">
                    <button
                      type="button"
                      draggable={!reorderBlocked}
                      className={`flex h-[30px] w-[22px] items-center justify-center rounded-md text-muted transition-colors ${
                        reorderBlocked
                          ? "cursor-default opacity-40"
                          : "cursor-grab hover:bg-elevated hover:text-text active:cursor-grabbing"
                      }`}
                      title={
                        reorderBlocked
                          ? "Clear search and filters to reorder"
                          : "Drag to reorder (or press ↑/↓)"
                      }
                      aria-label={`Reorder ${item.title || item.url}`}
                      disabled={reorderBlocked}
                      onDragStart={(event) => {
                        if (reorderBlocked) {
                          event.preventDefault();
                          return;
                        }
                        setDragId(item.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", item.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          void handleMove(item.id, -1);
                        } else if (event.key === "ArrowDown") {
                          event.preventDefault();
                          void handleMove(item.id, 1);
                        }
                      }}
                    >
                      <GripIcon />
                    </button>
                  </div>
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
                      : void handlePlay(item.url)
                  }
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
                    <span className="absolute left-1.5 top-1.5 z-[2] grid h-5 w-5 place-items-center rounded-full bg-black/60 text-accent">
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  )}
                  {!selectMode && (
                    <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-black shadow-lg">
                        <PlayFillIcon className="ml-0.5 h-3.5 w-3.5" />
                      </span>
                    </span>
                  )}
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
                      completed ? "text-text-dim" : "text-text"
                    } hover:text-accent`}
                    title={item.title || item.url}
                    onClick={() =>
                      selectMode
                        ? toggleSelect(item.id)
                        : void handlePlay(item.url)
                    }
                  >
                    {item.title || item.url}
                  </button>
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px] text-muted">
                    {item.isShort && <ShortBadge isShort url={item.url} />}
                    {item.liveStatus && item.liveStatus !== "none" && (
                      <LiveBadge status={item.liveStatus} />
                    )}
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
                    title={timeLabel(item.addedAt)}
                  >
                    {rowTime(item.addedAt)}
                  </span>
                  {!selectMode && (
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
                        onClick={(event) => toggleRowMenu(item, event)}
                      >
                        <MoreIcon className="h-[15px] w-[15px]" />
                      </button>
                      {menuId === item.id && (
                        <RowMenu
                          canQueue={canQueue}
                          refreshing={refreshingId === item.id}
                          resetLabel={resetLabel}
                          customSort={sort === "custom"}
                          reorderBlocked={reorderBlocked}
                          canMoveUp={customIndex > 0}
                          canMoveDown={
                            customIndex >= 0 && customIndex < items.length - 1
                          }
                          up={menuUp}
                          onAction={(action) =>
                            runRowAction(action, item)
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

function RowMenu({
  canQueue,
  refreshing,
  resetLabel,
  customSort,
  reorderBlocked,
  canMoveUp,
  canMoveDown,
  up,
  onAction,
}: {
  canQueue: boolean;
  refreshing: boolean;
  resetLabel: string | null;
  customSort: boolean;
  reorderBlocked: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  up: boolean;
  onAction: (action: RowAction) => void;
}): JSX.Element {
  return (
    <div
      role="menu"
      aria-label="Saved video actions"
      className={`absolute right-0 z-40 w-[200px] rounded-[10px] border border-border-strong bg-card p-1 shadow-xl ${
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
        icon={<CopyIcon />}
        label="Copy URL"
        onClick={() => onAction("copy")}
      />
      <MenuItem
        icon={<ExternalIcon />}
        label="Open in browser"
        onClick={() => onAction("open")}
      />
      <MenuItem
        icon={<RefreshIcon />}
        label={refreshing ? "Refreshing…" : "Refresh metadata"}
        disabled={refreshing}
        onClick={() => onAction("refresh")}
      />
      {resetLabel && (
        <MenuItem
          icon={<RotateIcon />}
          label={resetLabel}
          onClick={() => onAction("reset")}
        />
      )}
      {customSort && (
        <>
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={<ArrowUpIcon />}
            label="Move up"
            disabled={reorderBlocked || !canMoveUp}
            hint={
              reorderBlocked
                ? "Clear search and filters to reorder"
                : canMoveUp
                  ? undefined
                  : "Already at the top"
            }
            onClick={() => onAction("moveUp")}
          />
          <MenuItem
            icon={<ArrowDownIcon />}
            label="Move down"
            disabled={reorderBlocked || !canMoveDown}
            hint={
              reorderBlocked
                ? "Clear search and filters to reorder"
                : canMoveDown
                  ? undefined
                  : "Already at the bottom"
            }
            onClick={() => onAction("moveDown")}
          />
        </>
      )}
      <div className="my-1 h-px bg-border" />
      <MenuItem
        icon={<TrashIcon />}
        label="Remove from Watch Later"
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

function WatchLaterSkeleton() {
  const widths = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"];
  return (
    <div
      className="flex flex-col gap-2 pt-2"
      role="status"
      aria-label="Loading Watch Later"
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

function WatchLaterOffline({ onRetry }: { onRetry: () => void }) {
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
        Couldn't load Watch Later
      </p>
      <p className="mx-auto mb-0 mt-1.5 max-w-xs text-xs text-muted">
        The local server isn't responding.
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

function ChevronDownIcon({
  className,
}: {
  className?: string;
}): JSX.Element {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
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

function BookmarkIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

function RefreshIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </Icon>
  );
}

function RotateIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function ArrowUpIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  );
}

function ArrowDownIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

function GripIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <g fill="currentColor" stroke="none">
        <circle cx="9" cy="6" r="1.4" />
        <circle cx="15" cy="6" r="1.4" />
        <circle cx="9" cy="12" r="1.4" />
        <circle cx="15" cy="12" r="1.4" />
        <circle cx="9" cy="18" r="1.4" />
        <circle cx="15" cy="18" r="1.4" />
      </g>
    </Icon>
  );
}

function DownloadIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Icon>
  );
}

function UploadIcon({ className }: { className?: string }): JSX.Element {
  return (
    <Icon className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </Icon>
  );
}
