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
});

export const history = sqliteTable("history", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull().default(""),
  thumbnail: text("thumbnail").notNull().default(""),
  timestamp: integer("timestamp").notNull(),
});
