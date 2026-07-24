import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import initSqlJs from "sql.js";

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
}

export interface Settings {
  port: number;
  player: string;
  /** @deprecated Use playerArgs instead */
  mpvArgs: string;
  playerArgs: Record<string, string>;
  customPlayerPath: string;
  customPlayerArgs: string;
  autoStart: boolean;
  startMinimized: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  port: 5000,
  player: "mpv",
  mpvArgs: "",
  playerArgs: {},
  customPlayerPath: "",
  customPlayerArgs: "{url}",
  autoStart: false,
  startMinimized: false,
};

let db: any;

function dbPath(): string {
  return join(app.getPath("userData"), "mpv-play.db");
}

function saveDb(): void {
  writeFileSync(dbPath(), Buffer.from(db.export()));
}

function createTables(): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      port INTEGER NOT NULL DEFAULT 5000,
      player TEXT NOT NULL DEFAULT 'mpv',
      mpv_args TEXT NOT NULL DEFAULT '',
      player_args TEXT NOT NULL DEFAULT '{}',
      custom_player_path TEXT NOT NULL DEFAULT '',
      custom_player_args TEXT NOT NULL DEFAULT '{url}',
      auto_start INTEGER NOT NULL DEFAULT 0,
      start_minimized INTEGER NOT NULL DEFAULT 0
    )`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL
    )`,
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp DESC)");
}

function migrateJsonToSqlite(): void {
  const jsonPath = join(app.getPath("userData"), "mpv-play.json");
  if (!existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

    db.run(
      "INSERT OR REPLACE INTO settings (id, port, player, mpv_args, custom_player_path, custom_player_args, auto_start) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [1, data.settings.port, data.settings.player ?? "mpv", data.settings.mpvArgs, data.settings.customPlayerPath ?? "", data.settings.customPlayerArgs ?? "{url}", data.settings.autoStart ? 1 : 0],
    );

    for (const e of data.history ?? []) {
      db.run(
        "INSERT OR IGNORE INTO history (id, url, title, thumbnail, timestamp) VALUES (?, ?, ?, ?, ?)",
        [e.id, e.url, e.title ?? "", e.thumbnail ?? "", e.timestamp],
      );
    }
    saveDb();

    renameSync(jsonPath, jsonPath + ".bak");
    console.log("Migrated mpv-play.json to SQLite");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

function migrateSchema(): void {
  const info = db.exec("PRAGMA table_info(settings)");
  if (!info.length) return;
  const cols: string[] = info[0].values.map((c: any[]) => c[1]);

  const addCol = (name: string, def: string) => {
    if (!cols.includes(name)) {
      db.run(`ALTER TABLE settings ADD COLUMN ${name} ${def}`);
    }
  };

  addCol("player", "TEXT NOT NULL DEFAULT 'mpv'");
  addCol("custom_player_path", "TEXT NOT NULL DEFAULT ''");
  addCol("custom_player_args", "TEXT NOT NULL DEFAULT '{url}'");
  addCol("player_args", "TEXT NOT NULL DEFAULT '{}'");
  addCol("start_minimized", "INTEGER NOT NULL DEFAULT 0");

  const rows = db.exec("SELECT mpv_args, player_args FROM settings WHERE id = 1");
  if (rows.length && rows[0].values.length) {
    const [oldMpvArgs, currentPlayerArgs] = rows[0].values[0];
    const parsed = currentPlayerArgs ? JSON.parse(currentPlayerArgs) : {};
    if (oldMpvArgs && (currentPlayerArgs === "{}" || !currentPlayerArgs)) {
      parsed["mpv"] = oldMpvArgs;
      db.run("UPDATE settings SET player_args = ? WHERE id = ?", [JSON.stringify(parsed), 1]);
    }
  }
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  const path = dbPath();

  if (existsSync(path)) {
    db = new SQL.Database(readFileSync(path));
    migrateSchema();
    saveDb();
  } else {
    db = new SQL.Database();
    createTables();
    db.run(
      "INSERT INTO settings (id, port, player, mpv_args, custom_player_path, custom_player_args, auto_start) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [1, DEFAULT_SETTINGS.port, DEFAULT_SETTINGS.player, DEFAULT_SETTINGS.mpvArgs, DEFAULT_SETTINGS.customPlayerPath, DEFAULT_SETTINGS.customPlayerArgs, DEFAULT_SETTINGS.autoStart ? 1 : 0],
    );
    saveDb();
  }

  migrateJsonToSqlite();
}

function rows<T>(sql: string): T[] {
  const results = db.exec(sql);
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj as T;
  });
}

export function getSettings(): Settings {
  const r = rows<any>("SELECT * FROM settings WHERE id = 1")[0];
  return {
    port: r.port,
    player: r.player ?? "mpv",
    mpvArgs: r.mpv_args,
    playerArgs: r.player_args ? JSON.parse(r.player_args) : {},
    customPlayerPath: r.custom_player_path ?? "",
    customPlayerArgs: r.custom_player_args ?? "{url}",
    autoStart: r.auto_start === 1,
    startMinimized: r.start_minimized === 1,
  };
}

export function setSettings(partial: Partial<Settings>): Settings {
  const sets: string[] = [];
  const vals: any[] = [];
  if (partial.port !== undefined) { sets.push("port = ?"); vals.push(partial.port); }
  if (partial.player !== undefined) { sets.push("player = ?"); vals.push(partial.player); }
  if (partial.mpvArgs !== undefined) { sets.push("mpv_args = ?"); vals.push(partial.mpvArgs); }
  if (partial.customPlayerPath !== undefined) { sets.push("custom_player_path = ?"); vals.push(partial.customPlayerPath); }
  if (partial.customPlayerArgs !== undefined) { sets.push("custom_player_args = ?"); vals.push(partial.customPlayerArgs); }
  if (partial.autoStart !== undefined) { sets.push("auto_start = ?"); vals.push(partial.autoStart ? 1 : 0); }
  if (partial.playerArgs !== undefined) { sets.push("player_args = ?"); vals.push(JSON.stringify(partial.playerArgs)); }
  if (partial.startMinimized !== undefined) { sets.push("start_minimized = ?"); vals.push(partial.startMinimized ? 1 : 0); }
  if (sets.length) {
    vals.push(1);
    db.run(`UPDATE settings SET ${sets.join(", ")} WHERE id = ?`, vals);
    saveDb();
  }
  return getSettings();
}

export function getHistory(): HistoryEntry[] {
  return rows<HistoryEntry>("SELECT * FROM history ORDER BY timestamp DESC");
}

export function addHistory(url: string, title = "", thumbnail = ""): HistoryEntry {
  const entry: HistoryEntry = {
    id: Date.now().toString(),
    url,
    title,
    thumbnail,
    timestamp: Date.now(),
  };
  db.run(
    "INSERT INTO history (id, url, title, thumbnail, timestamp) VALUES (?, ?, ?, ?, ?)",
    [entry.id, entry.url, entry.title, entry.thumbnail, entry.timestamp],
  );
  saveDb();
  return entry;
}

export function deleteHistory(id: string): HistoryEntry[] {
  db.run("DELETE FROM history WHERE id = ?", [id]);
  saveDb();
  return getHistory();
}

export function clearHistory(): void {
  db.run("DELETE FROM history");
  saveDb();
}

export function updateHistoryEntry(id: string, partial: Partial<Pick<HistoryEntry, "title" | "thumbnail">>): void {
  const sets: string[] = [];
  const vals: any[] = [];
  if (partial.title !== undefined) { sets.push("title = ?"); vals.push(partial.title); }
  if (partial.thumbnail !== undefined) { sets.push("thumbnail = ?"); vals.push(partial.thumbnail); }
  if (sets.length) {
    vals.push(id);
    db.run(`UPDATE history SET ${sets.join(", ")} WHERE id = ?`, vals);
    saveDb();
  }
}
