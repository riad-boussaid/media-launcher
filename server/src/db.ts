import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { isLiveLike } from "./live.js";
import * as schema from "./schema.js";
import { isShortUrl } from "./shorts.js";
import type {
  HistoryEntry,
  RemoteSession,
  Settings,
  SettingsUpdate,
  WatchLaterEntry,
} from "./types.js";
import { canonicalizeUrl } from "./url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Overridable so the packaged desktop app can point this at a writable
// per-user directory instead of the read-only install location.
const DATA_DIR = process.env.DATA_DIR?.trim()
  ? resolve(process.env.DATA_DIR.trim())
  : join(__dirname, "..", "data");

export function getDataDir(): string {
  return DATA_DIR;
}

/** Closes the SQLite handle (used by tests after a temporary database). */
export function closeDatabase(): void {
  db.$client.close();
}

const PLAYER_KEYS = ["mpv", "iina", "potplayer", "custom"];

function dbPath(): string {
  return join(DATA_DIR, "media-launcher.db");
}

let db: ReturnType<typeof drizzle<typeof schema>>;

export function initDatabase(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const sqlite = new Database(dbPath());
  sqlite.pragma("journal_mode = WAL");
  db = drizzle(sqlite, { schema });

  // Ensure tables exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      player TEXT NOT NULL DEFAULT 'mpv',
      mpv_args TEXT NOT NULL DEFAULT '',
      player_args TEXT NOT NULL DEFAULT '{}',
      custom_player_path TEXT NOT NULL DEFAULT '',
      custom_player_args TEXT NOT NULL DEFAULT '{url}',
      bin_dir TEXT NOT NULL DEFAULT '',
      auto_start INTEGER NOT NULL DEFAULT 0,
      start_minimized INTEGER NOT NULL DEFAULT 0,
      resume_enabled INTEGER NOT NULL DEFAULT 1,
      remote_enabled INTEGER NOT NULL DEFAULT 0
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      live_status TEXT NOT NULL DEFAULT '',
      is_short INTEGER NOT NULL DEFAULT 0
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS remote_sessions (
      id TEXT PRIMARY KEY,
      device TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS watch_later (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      live_status TEXT NOT NULL DEFAULT '',
      is_short INTEGER NOT NULL DEFAULT 0
    )
  `);
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp DESC)",
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_watch_later_added ON watch_later(added_at DESC)",
  );

  migrateAddColumns(sqlite);
  normalizeHistoryUrls();
  normalizeWatchLaterUrls();
  backfillShortFlags();

  // Seed default settings if empty
  const existing = db.select().from(schema.settings).get();
  if (!existing) {
    db.insert(schema.settings)
      .values({
        id: 1,
        player: "mpv",
        mpvArgs: "",
        playerArgs: "{}",
        customPlayerPath: "",
        customPlayerArgs: "{url}",
        binDir: "",
        autoStart: false,
        startMinimized: false,
      })
      .run();
  }

  // Legacy migration: merge mpv_args into player_args if needed
  migrateMpvArgs(sqlite);
}

// Adds columns introduced after the initial release to databases created by
// older builds (CREATE TABLE IF NOT EXISTS won't touch existing tables).
function migrateAddColumns(sqlite: Database.Database): void {
  const historyCols = sqlite.prepare("PRAGMA table_info(history)").all() as {
    name: string;
  }[];
  if (!historyCols.some((c) => c.name === "position")) {
    sqlite.exec(
      "ALTER TABLE history ADD COLUMN position INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!historyCols.some((c) => c.name === "completed")) {
    sqlite.exec(
      "ALTER TABLE history ADD COLUMN completed INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!historyCols.some((c) => c.name === "duration")) {
    sqlite.exec(
      "ALTER TABLE history ADD COLUMN duration INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!historyCols.some((c) => c.name === "live_status")) {
    sqlite.exec(
      "ALTER TABLE history ADD COLUMN live_status TEXT NOT NULL DEFAULT ''",
    );
  }
  if (!historyCols.some((c) => c.name === "is_short")) {
    sqlite.exec(
      "ALTER TABLE history ADD COLUMN is_short INTEGER NOT NULL DEFAULT 0",
    );
  }
  const watchLaterCols = sqlite
    .prepare("PRAGMA table_info(watch_later)")
    .all() as {
    name: string;
  }[];
  if (!watchLaterCols.some((c) => c.name === "sort_order")) {
    sqlite.exec(
      "ALTER TABLE watch_later ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!watchLaterCols.some((c) => c.name === "live_status")) {
    sqlite.exec(
      "ALTER TABLE watch_later ADD COLUMN live_status TEXT NOT NULL DEFAULT ''",
    );
  }
  if (!watchLaterCols.some((c) => c.name === "is_short")) {
    sqlite.exec(
      "ALTER TABLE watch_later ADD COLUMN is_short INTEGER NOT NULL DEFAULT 0",
    );
  }
  const settingsCols = sqlite.prepare("PRAGMA table_info(settings)").all() as {
    name: string;
  }[];
  if (!settingsCols.some((c) => c.name === "resume_enabled")) {
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN resume_enabled INTEGER NOT NULL DEFAULT 1",
    );
  }
  if (!settingsCols.some((c) => c.name === "remote_enabled")) {
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN remote_enabled INTEGER NOT NULL DEFAULT 0",
    );
  }
}

function migrateMpvArgs(sqlite: Database.Database): void {
  const row = sqlite
    .prepare("SELECT mpv_args, player_args FROM settings WHERE id = 1")
    .get() as { mpv_args: string; player_args: string } | undefined;
  if (!row) return;

  let parsed: Record<string, string> = {};
  try {
    parsed = row.player_args ? JSON.parse(row.player_args) : {};
  } catch {
    parsed = {};
  }
  if (row.mpv_args && (row.player_args === "{}" || !row.player_args)) {
    parsed.mpv = row.mpv_args;
    sqlite
      .prepare("UPDATE settings SET player_args = ? WHERE id = ?")
      .run(JSON.stringify(parsed), 1);
  }
}

/**
 * Rewrites previously stored bookmarks to their canonical URL and merges any
 * duplicates, keeping the oldest bookmark (and its position in the list).
 * Idempotent; runs at startup so lists saved before canonicalization are
 * cleaned up without user action.
 */
function normalizeWatchLaterUrls(): void {
  const rows = db
    .select()
    .from(schema.watchLater)
    .orderBy(asc(schema.watchLater.addedAt))
    .all();
  for (const row of rows) {
    const canonical = canonicalizeUrl(row.url);
    if (canonical === row.url) continue;

    const duplicate = db
      .select()
      .from(schema.watchLater)
      .where(eq(schema.watchLater.url, canonical))
      .get();
    if (!duplicate) {
      db.update(schema.watchLater)
        .set({ url: canonical })
        .where(eq(schema.watchLater.id, row.id))
        .run();
      continue;
    }

    // Keep the older row's timestamp; fill in metadata the newer row has.
    const title = duplicate.title || row.title;
    const thumbnail = duplicate.thumbnail || row.thumbnail;
    const liveStatus = duplicate.liveStatus || row.liveStatus;
    const isShort = duplicate.isShort || row.isShort;
    if (
      title !== duplicate.title ||
      thumbnail !== duplicate.thumbnail ||
      liveStatus !== duplicate.liveStatus ||
      isShort !== duplicate.isShort
    ) {
      db.update(schema.watchLater)
        .set({ title, thumbnail, liveStatus, isShort })
        .where(eq(schema.watchLater.id, duplicate.id))
        .run();
    }
    db.delete(schema.watchLater).where(eq(schema.watchLater.id, row.id)).run();
  }
}

/**
 * Flags rows saved before Shorts/Reels detection existed. YouTube Shorts URLs
 * have already been canonicalized to /watch, so only rows whose URL still says
 * /shorts/ or /reel(s)/ can be recovered this way.
 */
function backfillShortFlags(): void {
  for (const row of db
    .select({
      id: schema.history.id,
      url: schema.history.url,
      isShort: schema.history.isShort,
    })
    .from(schema.history)
    .all()) {
    if (!row.isShort && isShortUrl(row.url)) {
      db.update(schema.history)
        .set({ isShort: true })
        .where(eq(schema.history.id, row.id))
        .run();
    }
  }
  for (const row of db
    .select({
      id: schema.watchLater.id,
      url: schema.watchLater.url,
      isShort: schema.watchLater.isShort,
    })
    .from(schema.watchLater)
    .all()) {
    if (!row.isShort && isShortUrl(row.url)) {
      db.update(schema.watchLater)
        .set({ isShort: true })
        .where(eq(schema.watchLater.id, row.id))
        .run();
    }
  }
}

/**
 * Rewrites history rows to their canonical URL and merges duplicates, keeping
 * the most recently played row's timestamp and metadata. Idempotent; runs at
 * startup so links recorded before canonicalization stay deduplicated.
 */
function normalizeHistoryUrls(): void {
  const rows = db
    .select()
    .from(schema.history)
    .orderBy(asc(schema.history.timestamp))
    .all();
  for (const row of rows) {
    const canonical = canonicalizeUrl(row.url);
    if (canonical === row.url) continue;

    // An earlier merge in this pass may have removed this row.
    const current = db
      .select()
      .from(schema.history)
      .where(eq(schema.history.id, row.id))
      .get();
    if (!current) continue;

    const duplicate = db
      .select()
      .from(schema.history)
      .where(eq(schema.history.url, canonical))
      .get();
    if (!duplicate) {
      db.update(schema.history)
        .set({ url: canonical })
        .where(eq(schema.history.id, current.id))
        .run();
      continue;
    }
    if (duplicate.id === current.id) continue;

    // History is recency-ordered: keep the newer row, borrowing metadata and
    // meaningful progress from the older one.
    const keep = current.timestamp >= duplicate.timestamp ? current : duplicate;
    const drop = keep.id === current.id ? duplicate : current;
    const progress =
      keep.position > 0 || keep.completed
        ? { position: keep.position, completed: keep.completed }
        : { position: drop.position, completed: drop.completed };
    db.delete(schema.history).where(eq(schema.history.id, drop.id)).run();
    db.update(schema.history)
      .set({
        url: canonical,
        title: keep.title || drop.title,
        thumbnail: keep.thumbnail || drop.thumbnail,
        duration: keep.duration || drop.duration,
        liveStatus: keep.liveStatus || drop.liveStatus,
        isShort: keep.isShort || drop.isShort,
        ...progress,
      })
      .where(eq(schema.history.id, keep.id))
      .run();
  }
}

function parsePlayerArgs(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function getSettings(): Settings {
  const r = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .get();
  if (!r) {
    return {
      player: "mpv",
      playerArgs: {},
      customPlayerPath: "",
      customPlayerArgs: "{url}",
      binDir: "",
      autoStart: false,
      startMinimized: false,
      resumePlayback: true,
      remoteEnabled: false,
    };
  }
  return {
    player: r.player,
    playerArgs: parsePlayerArgs(r.playerArgs),
    customPlayerPath: r.customPlayerPath,
    customPlayerArgs: r.customPlayerArgs,
    binDir: r.binDir,
    autoStart: r.autoStart,
    startMinimized: r.startMinimized,
    resumePlayback: r.resumeEnabled,
    remoteEnabled: r.remoteEnabled,
  };
}

export function setSettings(partial: SettingsUpdate): Settings {
  if (partial.player !== undefined && !PLAYER_KEYS.includes(partial.player)) {
    throw new Error(`Invalid player: ${partial.player}`);
  }
  if (
    partial.playerArgs !== undefined &&
    (typeof partial.playerArgs !== "object" ||
      partial.playerArgs === null ||
      Array.isArray(partial.playerArgs))
  ) {
    throw new Error("playerArgs must be an object");
  }

  const update: Record<string, unknown> = {};
  if (partial.player !== undefined) update.player = partial.player;
  if (partial.customPlayerPath !== undefined)
    update.customPlayerPath = partial.customPlayerPath;
  if (partial.customPlayerArgs !== undefined)
    update.customPlayerArgs = partial.customPlayerArgs;
  if (partial.playerArgs !== undefined)
    update.playerArgs = JSON.stringify(partial.playerArgs);
  if (partial.binDir !== undefined) update.binDir = partial.binDir;
  if (partial.autoStart !== undefined)
    update.autoStart = Boolean(partial.autoStart);
  if (partial.startMinimized !== undefined)
    update.startMinimized = Boolean(partial.startMinimized);
  if (partial.resumePlayback !== undefined)
    update.resumeEnabled = Boolean(partial.resumePlayback);
  if (partial.remoteEnabled !== undefined)
    update.remoteEnabled = Boolean(partial.remoteEnabled);

  if (Object.keys(update).length > 0) {
    db.update(schema.settings)
      .set(update)
      .where(eq(schema.settings.id, 1))
      .run();
  }
  return getSettings();
}

const HISTORY_LIMIT = 200;
const QUEUE_METADATA_LOOKUP_LIMIT = 500;

export function getHistory(): HistoryEntry[] {
  return db
    .select()
    .from(schema.history)
    .orderBy(desc(schema.history.timestamp))
    .limit(HISTORY_LIMIT)
    .all();
}

export function addHistory(
  url: string,
  title = "",
  thumbnail = "",
  timestamp?: number,
): HistoryEntry {
  // Store the canonical form so share links, embeds, and tracking-parameter
  // variants dedupe to one row.
  const canonicalUrl = canonicalizeUrl(url);
  // Dedupe by URL: replaying moves the entry to the top with a fresh
  // timestamp, carrying over metadata the new row doesn't provide.
  const existing = db
    .select()
    .from(schema.history)
    .where(eq(schema.history.url, canonicalUrl))
    .get();
  if (existing) {
    db.delete(schema.history).where(eq(schema.history.id, existing.id)).run();
  }
  const entry: HistoryEntry = {
    id: randomUUID(),
    url: canonicalUrl,
    title: title || existing?.title || "",
    thumbnail: thumbnail || existing?.thumbnail || "",
    timestamp: timestamp ?? Date.now(),
    position: existing?.position ?? 0,
    duration: existing?.duration ?? 0,
    // Queueing a watched video shouldn't clear its "Watched" marker; actual
    // progress is what resets it (see updateHistoryPositionByUrl).
    completed: existing?.completed ?? false,
    liveStatus: existing?.liveStatus ?? "",
    isShort: isShortUrl(url) || existing?.isShort || false,
  };
  db.insert(schema.history).values(entry).run();
  return entry;
}

export interface ImportedHistoryEntry {
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
  position: number;
  duration: number;
  completed: boolean;
  liveStatus: string;
  isShort: boolean;
}

/** Restores one history row from a Watch Later backup. */
export function importHistoryEntry(entry: ImportedHistoryEntry): HistoryEntry {
  const canonicalUrl = canonicalizeUrl(entry.url);
  const existing = db
    .select()
    .from(schema.history)
    .where(eq(schema.history.url, canonicalUrl))
    .get();
  if (existing) {
    db.delete(schema.history).where(eq(schema.history.id, existing.id)).run();
  }
  const row: HistoryEntry = {
    id: randomUUID(),
    url: canonicalUrl,
    title: entry.title || existing?.title || "",
    thumbnail: entry.thumbnail || existing?.thumbnail || "",
    timestamp: entry.timestamp || Date.now(),
    position: Math.max(0, Math.floor(entry.position)),
    duration: Math.max(0, Math.floor(entry.duration)),
    completed: entry.completed,
    liveStatus: entry.liveStatus,
    isShort: entry.isShort || existing?.isShort || false,
  };
  db.insert(schema.history).values(row).run();
  return row;
}

export function getHistoryPosition(url: string): number {
  // A live stream has no meaningful resume point, even if an older build
  // recorded one.
  if (isLiveLike(getHistoryLiveStatus(url))) return 0;

  // Compare canonical URLs so resume works across share-link variants. Ignore
  // rows that only exist because a video was queued (position 0, not
  // completed); the most recent row with real progress wins.
  const canonical = canonicalizeUrl(url);
  let latest: { position: number; timestamp: number } | null = null;
  for (const row of db
    .select({
      url: schema.history.url,
      position: schema.history.position,
      timestamp: schema.history.timestamp,
      completed: schema.history.completed,
    })
    .from(schema.history)
    .all()) {
    if (canonicalizeUrl(row.url) !== canonical) continue;
    if (row.position <= 0 && !row.completed) continue;
    if (!latest || row.timestamp > latest.timestamp) latest = row;
  }
  return latest?.position ?? 0;
}

/** Latest recorded live status for a URL, or "" when it has not been checked. */
export function getHistoryLiveStatus(url: string): string {
  const canonical = canonicalizeUrl(url);
  let latest: { liveStatus: string; timestamp: number } | null = null;
  for (const row of db
    .select({
      url: schema.history.url,
      liveStatus: schema.history.liveStatus,
      timestamp: schema.history.timestamp,
    })
    .from(schema.history)
    .all()) {
    if (canonicalizeUrl(row.url) !== canonical) continue;
    if (!latest || row.timestamp > latest.timestamp) latest = row;
  }
  return latest?.liveStatus ?? "";
}

/**
 * Metadata for queued URLs. mpv reports a playlist entry's title only after it
 * loads the file, so the queue UI would show bare hostnames until then; the
 * title and thumbnail recorded in history when the link was queued fill that
 * gap.
 */
export interface HistoryMetadata {
  title: string;
  thumbnail: string;
  liveStatus: string;
  isShort: boolean;
}

export function getHistoryMetadata(
  urls: string[],
): Map<string, HistoryMetadata> {
  const metadata = new Map<string, HistoryMetadata>();
  const unique = [...new Set(urls)].slice(0, QUEUE_METADATA_LOOKUP_LIMIT);
  if (unique.length === 0) return metadata;

  // Queue URLs may be raw share forms while history stores canonical URLs.
  const canonicalFor = new Map<string, string>();
  const lookups = new Set(unique);
  for (const url of unique) {
    const canonical = canonicalizeUrl(url);
    canonicalFor.set(url, canonical);
    lookups.add(canonical);
  }

  const rows = db
    .select({
      url: schema.history.url,
      title: schema.history.title,
      thumbnail: schema.history.thumbnail,
      liveStatus: schema.history.liveStatus,
      isShort: schema.history.isShort,
    })
    .from(schema.history)
    .where(inArray(schema.history.url, [...lookups]))
    .all();
  const byUrl = new Map(rows.map((row) => [row.url, row]));
  for (const url of unique) {
    const row = byUrl.get(url) ?? byUrl.get(canonicalFor.get(url) ?? "");
    if (row && (row.title || row.thumbnail || row.liveStatus || row.isShort)) {
      metadata.set(url, {
        title: row.title,
        thumbnail: row.thumbnail,
        liveStatus: row.liveStatus,
        isShort: row.isShort,
      });
    }
  }
  return metadata;
}

export function updateHistoryPositionByUrl(
  url: string,
  position: number,
  duration?: number,
): void {
  // Live streams have no stable position; don't record one.
  if (isLiveLike(getHistoryLiveStatus(url))) return;
  const canonical = canonicalizeUrl(url);
  const update: {
    position: number;
    completed: boolean;
    duration?: number;
  } = {
    position: Math.max(0, Math.floor(position)),
    // Real progress after a completed video means the user is rewatching.
    completed: false,
  };
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
    update.duration = Math.floor(duration);
  }
  db.update(schema.history)
    .set(update)
    .where(inArray(schema.history.url, [...new Set([url, canonical])]))
    .run();
}

/** Marks a video as watched to the end; a replay starts from the beginning. */
export function markHistoryCompleted(url: string, duration?: number): void {
  // A live or upcoming stream cannot be "finished" like a VOD.
  if (isLiveLike(getHistoryLiveStatus(url))) return;
  const canonical = canonicalizeUrl(url);
  const update: {
    position: number;
    completed: boolean;
    duration?: number;
  } = { position: 0, completed: true };
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
    update.duration = Math.floor(duration);
  }
  db.update(schema.history)
    .set(update)
    .where(inArray(schema.history.url, [...new Set([url, canonical])]))
    .run();
}

/** Clears completion and resume progress for a video. */
export function resetHistoryProgress(url: string): void {
  const canonical = canonicalizeUrl(url);
  db.update(schema.history)
    .set({ position: 0, completed: false })
    .where(inArray(schema.history.url, [...new Set([url, canonical])]))
    .run();
}

export function createRemoteSession(id: string, device: string): void {
  const now = Date.now();
  db.insert(schema.remoteSessions)
    .values({ id, device, createdAt: now, lastSeen: now })
    .run();
}

export function getRemoteSessions(): RemoteSession[] {
  return db
    .select()
    .from(schema.remoteSessions)
    .orderBy(desc(schema.remoteSessions.lastSeen))
    .all();
}

export function findRemoteSession(id: string): RemoteSession | null {
  return (
    db
      .select()
      .from(schema.remoteSessions)
      .where(eq(schema.remoteSessions.id, id))
      .get() ?? null
  );
}

export function touchRemoteSession(id: string): void {
  db.update(schema.remoteSessions)
    .set({ lastSeen: Date.now() })
    .where(eq(schema.remoteSessions.id, id))
    .run();
}

export function deleteRemoteSession(id: string): void {
  db.delete(schema.remoteSessions)
    .where(eq(schema.remoteSessions.id, id))
    .run();
}

export function deleteAllRemoteSessions(): void {
  db.delete(schema.remoteSessions).run();
}

export function deleteHistory(id: string): HistoryEntry[] {
  db.delete(schema.history).where(eq(schema.history.id, id)).run();
  return getHistory();
}

export function clearHistory(): void {
  db.delete(schema.history).run();
}

export function updateHistoryEntry(
  id: string,
  partial: Partial<
    Pick<
      HistoryEntry,
      "title" | "thumbnail" | "position" | "liveStatus" | "isShort"
    >
  >,
): void {
  const update: Record<string, string | number | boolean> = {};
  if (partial.title !== undefined) update.title = partial.title;
  if (partial.thumbnail !== undefined) update.thumbnail = partial.thumbnail;
  if (partial.position !== undefined) {
    update.position = Math.max(0, Math.floor(partial.position));
  }
  if (partial.liveStatus !== undefined) {
    update.liveStatus = partial.liveStatus;
  }
  // A Short is detected once and never downgraded by a later metadata result.
  if (partial.isShort) update.isShort = true;
  if (Object.keys(update).length > 0) {
    db.update(schema.history)
      .set(update)
      .where(eq(schema.history.id, id))
      .run();
  }
}

export function getWatchLater(): WatchLaterEntry[] {
  const entries = db
    .select()
    .from(schema.watchLater)
    .orderBy(desc(schema.watchLater.sortOrder), desc(schema.watchLater.addedAt))
    .all();

  // Join playback state by canonical URL so a bookmark saved from a share
  // link still picks up progress recorded for another form of the same video.
  const progress = new Map<
    string,
    {
      position: number;
      duration: number;
      completed: boolean;
      lastPlayedAt: number;
      liveStatus: string;
      isShort: boolean;
    }
  >();
  for (const row of db
    .select({
      url: schema.history.url,
      position: schema.history.position,
      duration: schema.history.duration,
      completed: schema.history.completed,
      timestamp: schema.history.timestamp,
      liveStatus: schema.history.liveStatus,
      isShort: schema.history.isShort,
    })
    .from(schema.history)
    .all()) {
    // Rows created only by queueing have no progress; ignore them so an older
    // completed or partially watched form still wins. Keep rows that carry a
    // live status or Short flag so Watch Later can show them before playback.
    if (
      row.position <= 0 &&
      !row.completed &&
      !row.liveStatus &&
      !row.isShort
    ) {
      continue;
    }
    const key = canonicalizeUrl(row.url);
    const previous = progress.get(key);
    if (!previous || row.timestamp > previous.lastPlayedAt) {
      progress.set(key, {
        position: row.position,
        duration: row.duration,
        completed: row.completed,
        lastPlayedAt: row.timestamp,
        liveStatus: row.liveStatus,
        isShort: row.isShort,
      });
    }
  }

  return entries.map((entry) => {
    const state = progress.get(entry.url);
    // Playback after saving gives the history row the fresher live status.
    const liveStatus =
      state && state.lastPlayedAt > entry.addedAt
        ? state.liveStatus || entry.liveStatus
        : entry.liveStatus || state?.liveStatus || "";
    const isShort = entry.isShort || state?.isShort || false;
    if (isLiveLike(liveStatus)) {
      return {
        ...entry,
        liveStatus,
        isShort,
        position: 0,
        duration: 0,
        completed: false,
        lastPlayedAt: state?.lastPlayedAt ?? 0,
      };
    }
    return state
      ? { ...entry, ...state, liveStatus, isShort }
      : {
          ...entry,
          liveStatus,
          isShort,
          position: 0,
          duration: 0,
          completed: false,
          lastPlayedAt: 0,
        };
  });
}

/** Finds a bookmark by any URL form of the same video. */
export function findWatchLater(url: string): WatchLaterEntry | undefined {
  const canonical = canonicalizeUrl(url);
  return getWatchLater().find(
    (entry) => canonicalizeUrl(entry.url) === canonical,
  );
}

export function addWatchLater(
  url: string,
  title = "",
  thumbnail = "",
  addedAt?: number,
): WatchLaterEntry {
  // Saving the same video from a share link, embed URL, or with tracking
  // parameters should update the existing bookmark rather than add another.
  const canonicalUrl = canonicalizeUrl(url);
  const existing = db
    .select()
    .from(schema.watchLater)
    .where(eq(schema.watchLater.url, canonicalUrl))
    .get();
  if (existing) {
    const nextTitle = title || existing.title;
    const nextThumbnail = thumbnail || existing.thumbnail;
    const nextIsShort = existing.isShort || isShortUrl(url);
    if (
      nextTitle !== existing.title ||
      nextThumbnail !== existing.thumbnail ||
      nextIsShort !== existing.isShort
    ) {
      db.update(schema.watchLater)
        .set({
          title: nextTitle,
          thumbnail: nextThumbnail,
          isShort: nextIsShort,
        })
        .where(eq(schema.watchLater.id, existing.id))
        .run();
    }
    return {
      ...existing,
      title: nextTitle,
      thumbnail: nextThumbnail,
      isShort: nextIsShort,
    };
  }
  const entry: WatchLaterEntry = {
    id: randomUUID(),
    url: canonicalUrl,
    title,
    thumbnail,
    addedAt: addedAt ?? Date.now(),
    // Filled in by the metadata lookup the save route starts.
    liveStatus: "",
    isShort: isShortUrl(url),
  };
  // New saves go to the top of a manual order as well as the newest-first
  // date sort.
  const top = db
    .select({ sortOrder: schema.watchLater.sortOrder })
    .from(schema.watchLater)
    .orderBy(desc(schema.watchLater.sortOrder))
    .limit(1)
    .get();
  db.insert(schema.watchLater)
    .values({ ...entry, sortOrder: (top?.sortOrder ?? 0) + 1 })
    .run();
  return entry;
}

export function setWatchLaterOrder(ids: string[]): void {
  const total = ids.length;
  for (let index = 0; index < total; index += 1) {
    db.update(schema.watchLater)
      .set({ sortOrder: total - index })
      .where(eq(schema.watchLater.id, ids[index]))
      .run();
  }
}

export function deleteWatchLater(id: string): WatchLaterEntry[] {
  db.delete(schema.watchLater).where(eq(schema.watchLater.id, id)).run();
  return getWatchLater();
}

export function clearWatchLater(): void {
  db.delete(schema.watchLater).run();
}

export function updateWatchLaterEntry(
  id: string,
  partial: Partial<
    Pick<WatchLaterEntry, "title" | "thumbnail" | "liveStatus" | "isShort">
  >,
): void {
  const update: Record<string, string | boolean> = {};
  if (partial.title !== undefined) update.title = partial.title;
  if (partial.thumbnail !== undefined) update.thumbnail = partial.thumbnail;
  if (partial.liveStatus !== undefined) {
    update.liveStatus = partial.liveStatus;
  }
  // A Short is detected once and never downgraded by a later metadata result.
  if (partial.isShort) update.isShort = true;
  if (Object.keys(update).length > 0) {
    db.update(schema.watchLater)
      .set(update)
      .where(eq(schema.watchLater.id, id))
      .run();
  }
}
