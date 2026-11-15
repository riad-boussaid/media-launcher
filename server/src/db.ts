import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import type { HistoryEntry, Settings, SettingsUpdate } from "./types.js";

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
      resume_enabled INTEGER NOT NULL DEFAULT 1
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )
  `);
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp DESC)",
  );

  migrateAddColumns(sqlite);

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
  const settingsCols = sqlite.prepare("PRAGMA table_info(settings)").all() as {
    name: string;
  }[];
  if (!settingsCols.some((c) => c.name === "resume_enabled")) {
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN resume_enabled INTEGER NOT NULL DEFAULT 1",
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

  if (Object.keys(update).length > 0) {
    db.update(schema.settings)
      .set(update)
      .where(eq(schema.settings.id, 1))
      .run();
  }
  return getSettings();
}

const HISTORY_LIMIT = 200;

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
  // Dedupe by URL: replaying moves the entry to the top with a fresh
  // timestamp, carrying over metadata the new row doesn't provide.
  const existing = db
    .select()
    .from(schema.history)
    .where(eq(schema.history.url, url))
    .get();
  if (existing) {
    db.delete(schema.history).where(eq(schema.history.id, existing.id)).run();
  }
  const entry: HistoryEntry = {
    id: randomUUID(),
    url,
    title: title || existing?.title || "",
    thumbnail: thumbnail || existing?.thumbnail || "",
    timestamp: timestamp ?? Date.now(),
    position: existing?.position ?? 0,
  };
  db.insert(schema.history).values(entry).run();
  return entry;
}

export function getHistoryPosition(url: string): number {
  const row = db
    .select({ position: schema.history.position })
    .from(schema.history)
    .where(eq(schema.history.url, url))
    .get();
  return row?.position ?? 0;
}

export function updateHistoryPositionByUrl(
  url: string,
  position: number,
): void {
  db.update(schema.history)
    .set({ position: Math.max(0, Math.floor(position)) })
    .where(eq(schema.history.url, url))
    .run();
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
  partial: Partial<Pick<HistoryEntry, "title" | "thumbnail" | "position">>,
): void {
  const update: Record<string, string | number> = {};
  if (partial.title !== undefined) update.title = partial.title;
  if (partial.thumbnail !== undefined) update.thumbnail = partial.thumbnail;
  if (partial.position !== undefined) {
    update.position = Math.max(0, Math.floor(partial.position));
  }
  if (Object.keys(update).length > 0) {
    db.update(schema.history)
      .set(update)
      .where(eq(schema.history.id, id))
      .run();
  }
}
