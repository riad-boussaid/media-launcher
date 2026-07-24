import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import type { HistoryEntry, Settings, SettingsUpdate } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "data");

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
      start_minimized INTEGER NOT NULL DEFAULT 0
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL
    )
  `);
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp DESC)",
  );

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

function migrateMpvArgs(sqlite: Database.Database): void {
  const row = sqlite
    .prepare("SELECT mpv_args, player_args FROM settings WHERE id = 1")
    .get() as { mpv_args: string; player_args: string } | undefined;
  if (!row) return;

  const parsed: Record<string, string> = row.player_args
    ? JSON.parse(row.player_args)
    : {};
  if (row.mpv_args && (row.player_args === "{}" || !row.player_args)) {
    parsed.mpv = row.mpv_args;
    sqlite
      .prepare("UPDATE settings SET player_args = ? WHERE id = ?")
      .run(JSON.stringify(parsed), 1);
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
      mpvArgs: "",
      playerArgs: {},
      customPlayerPath: "",
      customPlayerArgs: "{url}",
      binDir: "",
      autoStart: false,
      startMinimized: false,
    };
  }
  return {
    player: r.player,
    mpvArgs: r.mpvArgs,
    playerArgs: r.playerArgs ? JSON.parse(r.playerArgs) : {},
    customPlayerPath: r.customPlayerPath,
    customPlayerArgs: r.customPlayerArgs,
    binDir: r.binDir,
    autoStart: r.autoStart,
    startMinimized: r.startMinimized,
  };
}

export function setSettings(partial: SettingsUpdate): Settings {
  const update: Record<string, unknown> = {};
  if (partial.player !== undefined) update.player = partial.player;
  if (partial.mpvArgs !== undefined) update.mpvArgs = partial.mpvArgs;
  if (partial.customPlayerPath !== undefined)
    update.customPlayerPath = partial.customPlayerPath;
  if (partial.customPlayerArgs !== undefined)
    update.customPlayerArgs = partial.customPlayerArgs;
  if (partial.playerArgs !== undefined)
    update.playerArgs = JSON.stringify(partial.playerArgs);
  if (partial.binDir !== undefined) update.binDir = partial.binDir;
  if (partial.autoStart !== undefined) update.autoStart = partial.autoStart;
  if (partial.startMinimized !== undefined)
    update.startMinimized = partial.startMinimized;

  if (Object.keys(update).length > 0) {
    db.update(schema.settings)
      .set(update)
      .where(eq(schema.settings.id, 1))
      .run();
  }
  return getSettings();
}

export function getHistory(): HistoryEntry[] {
  return db
    .select()
    .from(schema.history)
    .orderBy(schema.history.timestamp)
    .all()
    .reverse();
}

export function addHistory(
  url: string,
  title = "",
  thumbnail = "",
): HistoryEntry {
  const entry: HistoryEntry = {
    id: Date.now().toString(),
    url,
    title,
    thumbnail,
    timestamp: Date.now(),
  };
  db.insert(schema.history).values(entry).run();
  return entry;
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
  partial: Partial<Pick<HistoryEntry, "title" | "thumbnail">>,
): void {
  const update: Record<string, string> = {};
  if (partial.title !== undefined) update.title = partial.title;
  if (partial.thumbnail !== undefined) update.thumbnail = partial.thumbnail;
  if (Object.keys(update).length > 0) {
    db.update(schema.history)
      .set(update)
      .where(eq(schema.history.id, id))
      .run();
  }
}
