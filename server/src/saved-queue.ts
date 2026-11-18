import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./db.js";

// The queue itself lives inside mpv, so the server snapshots it to disk and
// offers to restore it after a restart. This is deliberately a small JSON file
// rather than a database table: it is transient playback state, not history.

export interface SavedQueueEntry {
  url: string;
  title: string;
  thumbnail: string;
  source: "queue" | "playlist";
  playlistId: string | null;
  playlistTitle: string | null;
  playlistUrl: string | null;
  playlistTotal: number | null;
  playlistTruncated: boolean;
  playlistIndex: number | null;
}

export interface SavedQueue {
  savedAt: number;
  current: SavedQueueEntry | null;
  entries: SavedQueueEntry[];
}

function queuePath(): string {
  return join(getDataDir(), "saved-queue.json");
}

export function readSavedQueue(): SavedQueue | null {
  const path = queuePath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SavedQueue;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.current && !Array.isArray(parsed.entries)) return null;
    return {
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      current: parsed.current ?? null,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return null;
  }
}

export function writeSavedQueue(queue: SavedQueue): void {
  const path = queuePath();
  const temp = `${path}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(queue), "utf-8");
    renameSync(temp, path);
  } catch (err) {
    console.warn(
      `[queue] could not save queue: ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      unlinkSync(temp);
    } catch {
      /* ignore */
    }
  }
}

export function clearSavedQueue(): void {
  try {
    unlinkSync(queuePath());
  } catch {
    /* nothing to clear */
  }
}
