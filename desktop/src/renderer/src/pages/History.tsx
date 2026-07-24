import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryEntry } from "../lib/api";
import {
  clearHistory,
  deleteHistory,
  getHistory,
  getSettings,
} from "../lib/api";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

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

function displayUrl(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    return { host: u.hostname, path: u.pathname + u.search };
  } catch {
    return { host: "", path: url };
  }
}

export default function History() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setItems(await getHistory());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hasPending = items.some((e) => !e.title && !e.thumbnail);
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
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
    setItems(await deleteHistory(id));
  };

  const handleClear = async () => {
    await clearHistory();
    setItems([]);
    showToast("History cleared");
  };

  const handlePlayUrl = async (url: string) => {
    try {
      const settings = await getSettings();
      const res = await fetch(`${settings.serverUrl}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.text();
        showToast(`Error: ${err}`);
        return;
      }
      setItems(await getHistory());
      showToast("Playing...");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Error: ${message}`);
    }
  };

  const handleReplay = handlePlayUrl;

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
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  };

  const handleDeleteSelected = async () => {
    for (const id of selected) {
      setItems(await deleteHistory(id));
    }
    setSelected(new Set());
    setSelectMode(false);
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
            className="w-full py-2 pl-8 pr-8 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors placeholder:text-muted"
            type="text"
            placeholder="Search history..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-1.5 bg-none border-none text-muted text-lg cursor-pointer px-1.5 py-0.5 rounded hover:text-text hover:bg-[#2a2a4a]"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        {items.length > 0 && !selectMode && (
          <>
            <button
              type="button"
              className="px-3.5 py-2 border border-[#3a2a2a] rounded-lg bg-[#2a1a1a] text-danger text-xs cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 hover:bg-[#3a2a2a]"
              onClick={handleClear}
            >
              Clear all
            </button>
            <button
              type="button"
              className="px-3.5 py-2 border border-[#3a2a2a] rounded-lg bg-[#2a1a1a] text-danger text-xs cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 hover:bg-[#3a2a2a]"
              onClick={() => setSelectMode(true)}
            >
              Select
            </button>
          </>
        )}
        {selectMode && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#999] flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              All
            </label>
            <button
              type="button"
              className="px-3.5 py-2 border border-[#3a2a2a] rounded-lg bg-[#2a1a1a] text-danger text-xs cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 hover:bg-[#3a2a2a]"
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
                className="px-3.5 py-2 border border-[#3a2a2a] rounded-lg bg-[#2a1a1a] text-danger text-xs cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 hover:bg-[#3a2a2a] danger"
                onClick={handleDeleteSelected}
              >
                Delete ({selected.size})
              </button>
            )}
          </div>
        )}
      </div>

      {items.length > 0 && !search && (
        <div className="text-[11px] text-muted mb-2 uppercase tracking-[0.5px]">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 px-5 text-[#666]">
          {search ? (
            <>
              <p>No results for "{search}"</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSearch("")}
                style={{ marginTop: 12 }}
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <p>No history yet</p>
              <p className="text-xs mt-2 text-[#444]">
                Play a video from your browser to see it here
              </p>
            </>
          )}
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.label}>
            <div className="text-[11px] text-muted uppercase tracking-[1px] pt-3 pb-1.5 px-1 font-semibold">
              {group.label}
            </div>
            {group.entries.map((item) => {
              const { host, path } = displayUrl(item.url);
              return (
                <div
                  key={item.id}
                  className={`flex items-stretch mb-1 rounded-lg overflow-hidden transition-colors min-h-[56px] hover:bg-surface group ${selectMode ? "cursor-default" : ""}`}
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
                    className="w-20 flex-shrink-0 bg-[#0f0f1a] bg-cover bg-center cursor-pointer flex items-center justify-center rounded-l-lg overflow-hidden"
                    onClick={() => !selectMode && handleReplay(item.url)}
                    style={
                      item.thumbnail
                        ? { backgroundImage: `url(${item.thumbnail})` }
                        : undefined
                    }
                  >
                    {!item.thumbnail && (
                      <svg
                        className="w-5 h-5 text-[#333]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                  </div>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: row content clickable area */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: row content clickable area */}
                  <div
                    className="flex-1 flex items-center gap-2 px-2.5 py-2 cursor-pointer min-w-0"
                    onClick={() => !selectMode && handleReplay(item.url)}
                  >
                    <div className="flex-1 min-w-0" title={item.url}>
                      {item.title ? (
                        <div className="text-sm font-medium text-text overflow-hidden text-ellipsis whitespace-nowrap mb-0.5">
                          {item.title}
                        </div>
                      ) : null}
                      <div className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                        <span className="text-accent">{host}</span>
                        <span className="text-[#666]">{path}</span>
                      </div>
                    </div>
                    <div
                      className="text-[11px] text-muted whitespace-nowrap flex-shrink-0"
                      title={timeLabel(item.timestamp)}
                    >
                      {relativeTime(item.timestamp)}
                    </div>
                  </div>
                  {!selectMode && (
                    <div className="hidden group-hover:flex items-center gap-0.5 pr-1.5">
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
                        onClick={() => window.open(item.url, "_blank")}
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
                </div>
              );
            })}
          </div>
        ))
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
