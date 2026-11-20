import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { isLiveLike, parseLiveStatus } from "../server/src/live.ts";
import { isShortMetadata, isShortUrl, isReelUrl } from "../server/src/shorts.ts";

const short = "https://youtu.be/dQw4w9WgXcQ";
const canonical = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

// Point the server at a throwaway database and seed it with the pre-duration,
// pre-sort-order schema so the same process tests the upgrade path.
const dir = mkdtempSync(join(tmpdir(), "media-launcher-db-"));
process.env.DATA_DIR = dir;

const require = createRequire(import.meta.url);
const Database = require("../server/node_modules/better-sqlite3");
const sqlite = new Database(join(dir, "media-launcher.db"));
sqlite.exec(`
  CREATE TABLE history (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    thumbnail TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE watch_later (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    thumbnail TEXT NOT NULL DEFAULT '',
    added_at INTEGER NOT NULL
  );
`);
sqlite
  .prepare(
    "INSERT INTO history (id, url, title, thumbnail, timestamp, position, completed) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  .run("old-history", short, "Old history", "", 1000, 200, 0);
sqlite
  .prepare(
    "INSERT INTO watch_later (id, url, title, thumbnail, added_at) VALUES (?, ?, ?, ?, ?)",
  )
  .run("old-later", short, "Old bookmark", "", 1000);
sqlite
  .prepare(
    "INSERT INTO watch_later (id, url, title, thumbnail, added_at) VALUES (?, ?, ?, ?, ?)",
  )
  .run(
    "old-reel",
    "https://www.facebook.com/reel/123456",
    "Old reel",
    "",
    500,
  );
sqlite.close();

const db = await import("../server/src/db.ts");
db.initDatabase();

after(() => {
  db.closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

test("upgrades an old database and canonicalizes URLs", () => {
  const history = db.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].url, canonical);
  assert.equal(history[0].duration, 0);
  assert.equal(history[0].completed, false);
  assert.equal(history[0].liveStatus, "");
  assert.equal(history[0].isShort, false);

  const later = db.getWatchLater();
  assert.equal(later.length, 2);
  assert.equal(later[0].url, canonical);
  assert.equal(later[0].position, 200);
  assert.equal(later[0].duration, 0);
  assert.equal(later[0].completed, false);
  assert.equal(later[0].liveStatus, "");
  assert.equal(later[0].isShort, false);

  // Existing Reel rows are backfilled on startup.
  const oldReel = later.find((item) => item.title === "Old reel");
  assert.equal(oldReel?.url, "https://facebook.com/reel/123456");
  assert.equal(oldReel?.isShort, true);
});

test("detects Shorts and Reels from URLs and metadata", () => {
  assert.equal(isShortUrl("https://www.youtube.com/shorts/abc123"), true);
  assert.equal(
    isShortUrl("https://m.youtube.com/shorts/abc123?feature=share"),
    true,
  );
  assert.equal(isShortUrl("https://www.youtube.com/watch?v=abc123"), false);
  assert.equal(isShortUrl("not a url"), false);

  assert.equal(isReelUrl("https://www.facebook.com/reel/123456"), true);
  assert.equal(isReelUrl("https://www.facebook.com/reels/123456"), true);
  assert.equal(isReelUrl("https://www.instagram.com/reel/abc123/"), true);
  assert.equal(isReelUrl("https://www.instagram.com/reels/abc123"), true);
  assert.equal(isReelUrl("https://www.facebook.com/watch?v=123456"), false);
  assert.equal(isReelUrl("https://vimeo.com/reel/123456"), false);
  assert.equal(isShortUrl("https://www.instagram.com/reel/abc123"), true);

  assert.equal(
    isShortMetadata({ webpage_url: "https://www.youtube.com/shorts/abc123" }),
    true,
  );
  assert.equal(
    isShortMetadata({ webpage_url: "https://www.facebook.com/reel/123456" }),
    true,
  );
  assert.equal(isShortMetadata({ duration: 45, width: 1080, height: 1920 }), false);
  assert.equal(
    isShortMetadata({
      webpage_url: "https://www.youtube.com/watch?v=abc123",
      duration: 45,
      width: 1080,
      height: 1920,
    }),
    true,
  );
  assert.equal(
    isShortMetadata({
      webpage_url: "https://vimeo.com/123456",
      duration: 45,
      width: 1080,
      height: 1920,
    }),
    false,
  );
  assert.equal(
    isShortMetadata({ duration: 300, width: 1080, height: 1920 }),
    false,
  );
  assert.equal(
    isShortMetadata({ duration: 45, width: 1920, height: 1080 }),
    false,
  );
  assert.equal(isShortMetadata({}), false);
});

test("maps yt-dlp live fields", () => {
  assert.equal(parseLiveStatus("is_live", true, false), "live");
  assert.equal(parseLiveStatus("is_upcoming", false, false), "upcoming");
  assert.equal(parseLiveStatus("post_live", false, false), "post_live");
  assert.equal(parseLiveStatus("was_live", false, true), "was_live");
  assert.equal(parseLiveStatus("not_live", false, false), "none");
  assert.equal(parseLiveStatus(undefined, true, false), "live");
  assert.equal(isLiveLike("live"), true);
  assert.equal(isLiveLike("upcoming"), true);
  assert.equal(isLiveLike("post_live"), true);
  assert.equal(isLiveLike("was_live"), false);
  assert.equal(isLiveLike("none"), false);
});

test("history dedupes canonical URLs and tracks progress", () => {
  db.clearHistory();
  db.clearWatchLater();

  db.addHistory(short, "Video", "thumb");
  db.updateHistoryPositionByUrl(canonical, 120, 600);
  let history = db.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].url, canonical);
  assert.equal(history[0].position, 120);
  assert.equal(history[0].duration, 600);

  // Re-recording (e.g. queueing or replaying) carries metadata and progress.
  db.addHistory(canonical, "", "");
  history = db.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].title, "Video");
  assert.equal(history[0].thumbnail, "thumb");
  assert.equal(history[0].position, 120);
  assert.equal(history[0].duration, 600);

  db.markHistoryCompleted(canonical, 600);
  assert.equal(db.getHistoryPosition(short), 0);
  assert.equal(db.getHistory()[0].completed, true);
  assert.equal(db.getHistory()[0].duration, 600);

  db.resetHistoryProgress(canonical);
  assert.equal(db.getHistory()[0].completed, false);
  assert.equal(db.getHistory()[0].duration, 600);
});

test("watch later dedupes, preserves addedAt, and supports manual order", () => {
  db.clearHistory();
  db.clearWatchLater();

  const a = db.addWatchLater("https://example.com/a", "A", "", 1000);
  const b = db.addWatchLater("https://example.com/b", "B", "", 2000);
  const c = db.addWatchLater("https://example.com/c", "C", "", 3000);

  const duplicate = db.addWatchLater(`${short}?si=share`, "Shared", "", 5000);
  const duplicate2 = db.addWatchLater(canonical, "");
  assert.equal(duplicate.id, duplicate2.id);
  assert.equal(duplicate.addedAt, 5000);
  assert.equal(duplicate2.url, canonical);

  // New saves sit at the top of the custom order.
  assert.deepEqual(
    db.getWatchLater().slice(0, 2).map((entry) => entry.title),
    ["Shared", "C"],
  );

  db.setWatchLaterOrder([a.id, c.id, b.id, duplicate.id]);
  assert.deepEqual(
    db.getWatchLater().map((entry) => entry.title),
    ["A", "C", "B", "Shared"],
  );

  const d = db.addWatchLater("https://example.com/d", "D", "", 4000);
  assert.equal(db.getWatchLater()[0].id, d.id);
  assert.equal(db.getWatchLater()[0].title, "D");
});

test("watch later joins progress by canonical URL", () => {
  db.clearHistory();
  db.clearWatchLater();

  db.addWatchLater(short, "Video");
  db.addHistory(short, "Video");
  db.updateHistoryPositionByUrl(canonical, 120, 600);

  let entry = db.getWatchLater()[0];
  assert.equal(entry.position, 120);
  assert.equal(entry.duration, 600);
  assert.equal(entry.completed, false);

  db.markHistoryCompleted(canonical, 600);
  entry = db.getWatchLater()[0];
  assert.equal(entry.position, 0);
  assert.equal(entry.duration, 600);
  assert.equal(entry.completed, true);
});

test("finds Watch Later entries by any canonical URL form", () => {
  db.clearHistory();
  db.clearWatchLater();

  const saved = db.addWatchLater(short, "Video");
  assert.equal(db.findWatchLater(canonical)?.id, saved.id);
  assert.equal(
    db.findWatchLater("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.id,
    saved.id,
  );
  assert.equal(db.findWatchLater("https://example.com/not-saved"), undefined);
});

test("live videos do not accumulate resume progress", () => {
  db.clearHistory();
  db.clearWatchLater();

  const history = db.addHistory(short, "Live", "");
  db.updateHistoryEntry(history.id, { liveStatus: "live" });
  db.updateHistoryPositionByUrl(canonical, 120, 600);
  assert.equal(db.getHistory()[0].position, 0);
  assert.equal(db.getHistory()[0].duration, 0);
  assert.equal(db.getHistoryPosition(short), 0);

  db.markHistoryCompleted(canonical, 600);
  assert.equal(db.getHistory()[0].completed, false);

  const bookmark = db.addWatchLater(short, "Live");
  db.updateWatchLaterEntry(bookmark.id, { liveStatus: "live" });
  let entry = db.getWatchLater()[0];
  assert.equal(entry.liveStatus, "live");
  assert.equal(entry.position, 0);
  assert.equal(entry.completed, false);

  // A finished stream's VOD behaves normally again.
  db.updateHistoryEntry(history.id, { liveStatus: "was_live" });
  db.updateWatchLaterEntry(bookmark.id, { liveStatus: "was_live" });
  db.updateHistoryPositionByUrl(canonical, 120, 600);
  assert.equal(db.getHistory()[0].position, 120);
  entry = db.getWatchLater()[0];
  assert.equal(entry.liveStatus, "was_live");
  assert.equal(entry.position, 120);
  assert.equal(entry.duration, 600);
});

test("stores the Shorts flag and joins it into Watch Later", () => {
  db.clearHistory();
  db.clearWatchLater();

  const short = db.addWatchLater(
    "https://www.youtube.com/shorts/abcdefghijk",
    "Short",
  );
  assert.equal(short.isShort, true);
  assert.equal(short.url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(db.getWatchLater()[0].isShort, true);

  const reel = db.addWatchLater("https://www.facebook.com/reel/123456", "Reel");
  assert.equal(reel.isShort, true);
  assert.equal(reel.url, "https://facebook.com/reel/123456");

  const video = db.addWatchLater(canonical, "Video");
  assert.equal(video.isShort, false);
  const history = db.addHistory(canonical, "Video");
  db.updateHistoryEntry(history.id, { isShort: true });

  const joined = db.getWatchLater().find((item) => item.id === video.id);
  assert.equal(joined?.isShort, true);

  // A later metadata result cannot downgrade the flag.
  db.updateHistoryEntry(history.id, { isShort: false });
  assert.equal(db.getHistory()[0].isShort, true);
  db.updateWatchLaterEntry(video.id, { isShort: false });
  const unchanged = db.getWatchLater().find((item) => item.id === video.id);
  assert.equal(unchanged?.isShort, true);
});

test("restores backup progress and flags into history", () => {
  db.clearHistory();
  db.clearWatchLater();

  db.addWatchLater(canonical, "Video");
  const now = Date.now();
  db.importHistoryEntry({
    url: canonical,
    title: "Video",
    thumbnail: "thumb",
    timestamp: now,
    position: 120,
    duration: 600,
    completed: false,
    liveStatus: "none",
    isShort: true,
  });

  const history = db.getHistory()[0];
  assert.equal(history.position, 120);
  assert.equal(history.duration, 600);
  assert.equal(history.thumbnail, "thumb");
  assert.equal(history.isShort, true);
  assert.equal(history.liveStatus, "none");

  const entry = db.getWatchLater()[0];
  assert.equal(entry.position, 120);
  assert.equal(entry.duration, 600);
  assert.equal(entry.isShort, true);
  assert.equal(entry.lastPlayedAt, now);
});
