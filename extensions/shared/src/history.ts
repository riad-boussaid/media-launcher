import {
  addServerHistory,
  clearServerHistory,
  deleteServerHistory,
  getServerHistory,
  type HistoryEntry,
} from "@shared/api";
import { ext } from "@shared/ext";

export type { HistoryEntry };

// The server's SQLite history is the single source of truth (the desktop
// History page reads the same rows). Local storage holds a mirror as an
// offline cache so the popup's Recent list survives server hiccups.
const CACHE_KEY = "media-launcher-history-cache";
const LEGACY_KEY = "media-launcher-history";

/** Reads the server history; falls back to the last-known cache offline. */
export async function getRecent(): Promise<HistoryEntry[]> {
  const history = await getServerHistory();
  if (history) {
    await ext.storage.local.set({ [CACHE_KEY]: history });
    return history;
  }
  const cached = await ext.storage.local.get(CACHE_KEY);
  const list = cached[CACHE_KEY];
  return Array.isArray(list) ? (list as HistoryEntry[]) : [];
}

/** Deletes one server entry; returns the fresh list, or the cache offline. */
export async function removeEntry(id: string): Promise<HistoryEntry[]> {
  const history = await deleteServerHistory(id);
  if (history) {
    await ext.storage.local.set({ [CACHE_KEY]: history });
    return history;
  }
  return getRecent();
}

/** Clears all history. Returns false when the server is unreachable. */
export async function clearAll(): Promise<boolean> {
  const ok = await clearServerHistory();
  if (ok) {
    await ext.storage.local.set({ [CACHE_KEY]: [] });
  }
  return ok;
}

// One-time migration: push the legacy local-storage history (the
// pre-unification popup list) into the server, oldest first so relative
// ordering survives, then drop the legacy key. Safe to rerun.
export async function migrateLegacy(): Promise<void> {
  const stored = await ext.storage.local.get(LEGACY_KEY);
  const legacy = stored[LEGACY_KEY];
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  for (const raw of [...legacy].reverse()) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { url?: unknown; title?: unknown; timestamp?: unknown };
    if (typeof entry.url !== "string") continue;
    await addServerHistory({
      url: entry.url,
      title: typeof entry.title === "string" ? entry.title : "",
      timestamp:
        typeof entry.timestamp === "number" && entry.timestamp > 0
          ? entry.timestamp
          : undefined,
    });
  }
  await ext.storage.local.remove(LEGACY_KEY);
}
