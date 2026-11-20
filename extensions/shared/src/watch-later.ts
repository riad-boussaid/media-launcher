import {
  addServerWatchLater,
  clearServerWatchLater,
  deleteServerWatchLater,
  getServerWatchLater,
  type WatchLaterEntry,
} from "@shared/api";
import { ext } from "@shared/ext";
import { WATCH_LATER_CACHE_KEY } from "@shared/storage-keys";

export type { WatchLaterEntry };

// The server owns the list; local storage is only a read-through cache so the
// popup can still show saved videos while the server is briefly unreachable.
const CACHE_KEY = WATCH_LATER_CACHE_KEY;

/** Reads the saved videos; falls back to the last-known cache offline. */
export async function getLater(): Promise<WatchLaterEntry[]> {
  const entries = await getServerWatchLater();
  if (entries) {
    await ext.storage.local.set({ [CACHE_KEY]: entries });
    return entries;
  }
  const cached = await ext.storage.local.get(CACHE_KEY);
  const list = cached[CACHE_KEY];
  return Array.isArray(list) ? (list as WatchLaterEntry[]) : [];
}

/** Saves a URL and returns the refreshed list, or null when unreachable. */
export async function saveLater(entry: {
  url: string;
  title?: string;
  thumbnail?: string;
}): Promise<WatchLaterEntry[] | null> {
  const saved = await addServerWatchLater(entry);
  if (!saved) return null;
  return getLater();
}

/** Removes one entry and returns the refreshed list, or null on failure. */
export async function removeLater(
  id: string,
): Promise<WatchLaterEntry[] | null> {
  const entries = await deleteServerWatchLater(id);
  if (!entries) return null;
  await ext.storage.local.set({ [CACHE_KEY]: entries });
  return entries;
}

/** Clears the whole list. Returns false when the server is unreachable. */
export async function clearLater(): Promise<boolean> {
  const ok = await clearServerWatchLater();
  if (ok) {
    await ext.storage.local.set({ [CACHE_KEY]: [] });
  }
  return ok;
}
