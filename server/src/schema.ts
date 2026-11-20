import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  player: text("player").notNull().default("mpv"),
  mpvArgs: text("mpv_args").notNull().default(""),
  playerArgs: text("player_args").notNull().default("{}"),
  customPlayerPath: text("custom_player_path").notNull().default(""),
  customPlayerArgs: text("custom_player_args").notNull().default("{url}"),
  binDir: text("bin_dir").notNull().default(""),
  autoStart: integer("auto_start", { mode: "boolean" })
    .notNull()
    .default(false),
  startMinimized: integer("start_minimized", { mode: "boolean" })
    .notNull()
    .default(false),
  resumeEnabled: integer("resume_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  remoteEnabled: integer("remote_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const history = sqliteTable("history", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull().default(""),
  thumbnail: text("thumbnail").notNull().default(""),
  timestamp: integer("timestamp").notNull(),
  position: integer("position").notNull().default(0),
  duration: integer("duration").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  liveStatus: text("live_status").notNull().default(""),
  isShort: integer("is_short", { mode: "boolean" }).notNull().default(false),
});

export const watchLater = sqliteTable("watch_later", {
  id: text("id").primaryKey(),
  url: text("url").notNull().unique(),
  title: text("title").notNull().default(""),
  thumbnail: text("thumbnail").notNull().default(""),
  addedAt: integer("added_at").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  liveStatus: text("live_status").notNull().default(""),
  isShort: integer("is_short", { mode: "boolean" }).notNull().default(false),
});

export const remoteSessions = sqliteTable("remote_sessions", {
  // The ID is the SHA-256 hash of the session token, so a leaked database
  // never leaks usable tokens.
  id: text("id").primaryKey(),
  device: text("device").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
});
