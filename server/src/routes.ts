import { randomBytes } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import {
  consumePairingCode,
  extractToken,
  hashToken,
  issuePairingCodes,
  matchesMasterToken,
} from "./auth.js";
import {
  addHistory,
  clearHistory,
  createRemoteSession,
  deleteAllRemoteSessions,
  deleteHistory,
  deleteRemoteSession,
  findRemoteSession,
  getHistory,
  getHistoryPosition,
  getRemoteSessions,
  getSettings,
  setSettings,
  updateHistoryEntry,
} from "./db.js";
import { fetchMetadata } from "./metadata.js";
import { launchPlayer } from "./player.js";
import {
  chapterNext,
  chapterPrev,
  clearPlaybackError,
  clearPlayedPlaylist,
  clearQueue,
  getPlayerStatus,
  insertUpcoming,
  moveQueueItem,
  moveQueueItemTo,
  playNow,
  playQueueItem,
  type QueueSourceInfo,
  queueUrl,
  registerPlayer,
  rememberQueueSources,
  removePlaylistFromQueue,
  removeQueueItem,
  seekTo,
  setRepeatMode,
  setSpeed,
  setVolume,
  shuffleQueue,
  skipTrack,
  stopPlayback,
  toggleMute,
  togglePause,
} from "./player-ipc.js";
import {
  fetchPlaylistInfo,
  fetchPlaylistPage,
  isPlaylistUrl,
  PLAYLIST_ENTRY_LIMIT,
  type PlaylistInfo,
} from "./playlists.js";
import { clearSavedQueue, readSavedQueue } from "./saved-queue.js";
import { API_VERSION, SERVER_VERSION } from "./version.js";

const app = new Hono();

function enrichMetadata(historyId: string, url: string): void {
  fetchMetadata(url)
    .then((meta) => {
      if (meta.title || meta.thumbnail) {
        updateHistoryEntry(historyId, meta);
      }
    })
    .catch((err) => {
      console.error("metadata enrichment failed:", err);
    });
}

function isUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isOptions(value: unknown): value is string[] {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((o) => typeof o === "string");
}

function isQueueIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function playlistSources(
  playlist: PlaylistInfo,
  sourceUrl: string,
): QueueSourceInfo[] {
  return playlist.entries.map((entry) => ({
    url: entry.url,
    source: "playlist",
    title: entry.title,
    thumbnail: entry.thumbnail,
    playlistId: playlist.id,
    playlistTitle: playlist.title,
    playlistUrl: sourceUrl,
    playlistTotal: playlist.total,
    playlistTruncated: playlist.truncated,
    playlistIndex: entry.playlistIndex,
  }));
}

async function enqueueEntries(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    if (!(await queueUrl(url))) return false;
  }
  return true;
}

app.get("/api/health", (c) => {
  return c.json({
    app: "media-launcher",
    pid: process.pid,
    version: SERVER_VERSION,
    apiVersion: API_VERSION,
  });
});

// The remote page's CSP keeps external images out, so it loads thumbnails
// through this token-protected proxy instead. Reject loopback/private targets
// to keep the proxy from being usable as an SSRF hop.
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

function blockedThumbnailHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host.includes(":")) return true; // IPv6 literal
  // Thumbnail CDNs use dotted names; single-label hosts can resolve to LAN
  // services or be decimal/hex forms of loopback addresses.
  if (!host.includes(".")) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function thumbnailUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (blockedThumbnailHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

app.get("/thumbnail", async (c) => {
  const raw = c.req.query("url");
  const target = raw ? thumbnailUrl(raw) : null;
  if (!target) return c.json({ err: "invalid thumbnail url" }, 400);

  try {
    const res = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "media-launcher" },
    });
    if (!res.ok) return c.json({ err: "thumbnail fetch failed" }, 502);
    if (!thumbnailUrl(res.url)) {
      return c.json({ err: "invalid thumbnail redirect" }, 502);
    }
    const type = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!type.startsWith("image/")) {
      return c.json({ err: "not an image" }, 415);
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > THUMBNAIL_MAX_BYTES) {
      return c.json({ err: "thumbnail too large" }, 413);
    }
    const body = await res.arrayBuffer();
    if (body.byteLength > THUMBNAIL_MAX_BYTES) {
      return c.json({ err: "thumbnail too large" }, 413);
    }
    return c.body(body, 200, {
      "Content-Type": type,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=86400",
    });
  } catch {
    return c.json({ err: "thumbnail fetch failed" }, 502);
  }
});

app.post("/", async (c) => {
  try {
    const { url, options, title, thumbnail, queue } = await c.req.json<{
      url?: string;
      options?: string[];
      title?: string;
      thumbnail?: string;
      queue?: boolean;
    }>();
    if (!isUrl(url)) {
      return c.json({ err: "url must be a valid http(s) URL" }, 400);
    }
    if (!isOptions(options)) {
      return c.json({ err: "options must be an array of strings" }, 400);
    }
    const shouldQueue = queue === true;
    const titleText = typeof title === "string" ? title : "";
    const thumbnailText = typeof thumbnail === "string" ? thumbnail : "";

    const settings = getSettings();
    const isMpv = (settings.player || "mpv") === "mpv";
    const player = getPlayerStatus();

    // Queueing appends to a live mpv playlist. Without one there is nothing to
    // append to, and launching a player here would play the video instead of
    // queueing it.
    if (shouldQueue && !(isMpv && player.alive && player.ipcReady)) {
      return c.json({ err: "Start a video before queueing another" }, 409);
    }

    // Playlists are resolved up front so we can queue real video entries with
    // their titles, thumbnails, and playlist provenance instead of relying on
    // mpv's ytdl_hook (which defaults to --no-playlist).
    if (isMpv && isPlaylistUrl(url)) {
      const playlist = await fetchPlaylistInfo(url);
      if (!playlist) {
        return c.json({ err: "Could not read that playlist" }, 502);
      }
      if (playlist.entries.length === 0) {
        return c.json({ err: "That playlist is empty" }, 502);
      }
      const first = playlist.entries[0];
      const sources = playlistSources(playlist, url);
      const playlistMeta = {
        id: playlist.id,
        title: playlist.title,
        count: playlist.entries.length,
        truncated: playlist.truncated,
      };

      if (player.alive && player.ipcReady) {
        // Record provenance before any entry can start playing.
        rememberQueueSources(sources);
        if (!shouldQueue) {
          if (!(await playNow(first.url))) {
            return c.json(
              { err: "Could not control the running mpv instance" },
              503,
            );
          }
          if (
            !(await enqueueEntries(playlist.entries.slice(1).map((e) => e.url)))
          ) {
            return c.json({ err: "Could not add the whole playlist" }, 503);
          }
        } else if (
          !(await enqueueEntries(playlist.entries.map((e) => e.url)))
        ) {
          return c.json({ err: "Could not add the whole playlist" }, 503);
        }

        if (!shouldQueue) {
          const entry = addHistory(first.url, first.title, first.thumbnail);
          if (!first.title || !first.thumbnail) {
            enrichMetadata(entry.id, first.url);
          }
        }
        return c.json({
          data: shouldQueue ? "queued" : "success",
          playlist: playlistMeta,
        });
      }

      const launchOptions = [...(options ?? [])];
      // mpv's --start applies to every file in a playlist, so only resume a
      // single-entry "playlist"; multi-track playback must start at 0.
      if (settings.resumePlayback && playlist.entries.length === 1) {
        const position = getHistoryPosition(first.url);
        if (position > 60) {
          launchOptions.unshift(`--start=${Math.floor(position)}`);
        }
      }
      // Pass the whole resolved playlist on the command line so mpv's startup
      // cannot race with per-entry IPC appends.
      const result = await launchPlayer(
        first.url,
        launchOptions,
        playlist.entries.slice(1).map((entry) => entry.url),
      );
      if (!result.success) {
        return c.json({ err: result.error }, 503);
      }
      if (result.proc && result.pipePath) {
        registerPlayer(result.proc, result.pipePath, first.url);
      }
      rememberQueueSources(sources);
      const entry = addHistory(first.url, first.title, first.thumbnail);
      if (!first.title || !first.thumbnail) {
        enrichMetadata(entry.id, first.url);
      }
      return c.json({
        data: shouldQueue ? "queued" : "success",
        playlist: playlistMeta,
      });
    }

    // An mpv instance is already playing — enqueue, or replace it in place.
    if (isMpv && player.alive && player.ipcReady) {
      const ok = shouldQueue ? await queueUrl(url) : await playNow(url);
      if (!ok) {
        return c.json(
          { err: "Could not control the running mpv instance" },
          503,
        );
      }
      rememberQueueSources([
        { url, source: "queue", title: titleText, thumbnail: thumbnailText },
      ]);
      const entry = addHistory(url, titleText, thumbnailText);
      enrichMetadata(entry.id, url);
      return c.json({ data: shouldQueue ? "queued" : "success" });
    }

    const launchOptions = [...(options ?? [])];
    // Auto-resume: continue a partially watched video where it left off.
    if (isMpv && settings.resumePlayback) {
      const position = getHistoryPosition(url);
      if (position > 60) {
        launchOptions.unshift(`--start=${Math.floor(position)}`);
      }
    }

    const result = await launchPlayer(url, launchOptions);
    if (!result.success) {
      return c.json({ err: result.error }, 503);
    }
    if (result.proc && result.pipePath) {
      registerPlayer(result.proc, result.pipePath, url);
    }
    rememberQueueSources([
      { url, source: "queue", title: titleText, thumbnail: thumbnailText },
    ]);
    const entry = addHistory(url, titleText, thumbnailText);
    enrichMetadata(entry.id, url);
    return c.json({ data: shouldQueue ? "queued" : "success" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return c.json({ err: message }, 500);
  }
});

app.get("/player", (c) => {
  return c.json(getPlayerStatus());
});

app.get("/player/saved-queue", (c) => {
  return c.json(readSavedQueue());
});

app.delete("/player/saved-queue", (c) => {
  clearSavedQueue();
  return c.json({ data: "ok" });
});

app.post("/player/queue/restore", async (c) => {
  const saved = readSavedQueue();
  if (!saved || (!saved.current && saved.entries.length === 0)) {
    return c.json({ err: "No saved queue to restore" }, 404);
  }
  const player = getPlayerStatus();
  if (player.alive) {
    return c.json(
      { err: "Stop the current video before restoring a queue" },
      409,
    );
  }
  const items = saved.current
    ? [saved.current, ...saved.entries]
    : saved.entries;
  const first = items[0];
  const result = await launchPlayer(
    first.url,
    [],
    items.slice(1).map((entry) => entry.url),
  );
  if (!result.success) {
    return c.json({ err: result.error }, 503);
  }
  if (result.proc && result.pipePath) {
    registerPlayer(result.proc, result.pipePath, first.url);
  }
  rememberQueueSources(
    items.map((entry) => ({
      url: entry.url,
      source: entry.source,
      title: entry.title,
      thumbnail: entry.thumbnail,
      playlistId: entry.playlistId ?? undefined,
      playlistTitle: entry.playlistTitle ?? undefined,
      playlistUrl: entry.playlistUrl ?? undefined,
      playlistTotal: entry.playlistTotal ?? undefined,
      playlistTruncated: entry.playlistTruncated,
      playlistIndex: entry.playlistIndex ?? undefined,
    })),
  );
  const history = addHistory(first.url, first.title, first.thumbnail);
  if (!first.title || !first.thumbnail) {
    enrichMetadata(history.id, first.url);
  }
  return c.json({ data: "ok", count: items.length });
});

app.post("/player/pause", async (c) => {
  const ok = await togglePause();
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/skip", async (c) => {
  const ok = await skipTrack();
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/remove", async (c) => {
  const { index } = await c.req.json<{ index?: unknown }>();
  if (!isQueueIndex(index)) {
    return c.json({ err: "index must be a non-negative integer" }, 400);
  }
  const ok = await removeQueueItem(index);
  if (!ok) {
    return c.json({ err: "Could not remove that queued item" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/move", async (c) => {
  const { index, direction } = await c.req.json<{
    index?: unknown;
    direction?: unknown;
  }>();
  if (!isQueueIndex(index)) {
    return c.json({ err: "index must be a non-negative integer" }, 400);
  }
  if (direction !== "up" && direction !== "down") {
    return c.json({ err: "direction must be up or down" }, 400);
  }
  const ok = await moveQueueItem(index, direction);
  if (!ok) {
    return c.json({ err: "Could not move that queued item" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/move-to", async (c) => {
  const { index, target } = await c.req.json<{
    index?: unknown;
    target?: unknown;
  }>();
  if (!isQueueIndex(index) || !isQueueIndex(target)) {
    return c.json(
      { err: "index and target must be non-negative integers" },
      400,
    );
  }
  const ok = await moveQueueItemTo(index, target);
  if (!ok) {
    return c.json({ err: "Could not move that queued item" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/shuffle", async (c) => {
  const ok = await shuffleQueue();
  if (!ok) {
    return c.json({ err: "Need at least two queued items to shuffle" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/play", async (c) => {
  const { index } = await c.req.json<{ index?: unknown }>();
  if (!isQueueIndex(index)) {
    return c.json({ err: "index must be a non-negative integer" }, 400);
  }
  const ok = await playQueueItem(index);
  if (!ok) {
    return c.json({ err: "Could not play that queued item" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/load-playlist", async (c) => {
  const body: { playlistUrl?: unknown; playlistId?: unknown } = await c.req
    .json<{ playlistUrl?: unknown; playlistId?: unknown }>()
    .catch(() => ({}));
  const playlistUrl =
    typeof body.playlistUrl === "string" ? body.playlistUrl : "";
  const playlistId = typeof body.playlistId === "string" ? body.playlistId : "";
  if (!isPlaylistUrl(playlistUrl) || !playlistId) {
    return c.json({ err: "playlistUrl and playlistId are required" }, 400);
  }
  const player = getPlayerStatus();
  if (!player.alive || !player.ipcReady) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }

  let loadedMax = 0;
  const consider = (id: string | null, index: number | null) => {
    if (id === playlistId && index !== null) {
      loadedMax = Math.max(loadedMax, index);
    }
  };
  if (player.source === "playlist") {
    consider(player.playlistId, player.playlistIndex);
  }
  const queued = [...player.past, ...player.queue];
  for (const entry of queued) consider(entry.playlistId, entry.playlistIndex);
  if (loadedMax === 0) {
    return c.json({ err: "That playlist is not in the queue" }, 404);
  }

  const page = await fetchPlaylistPage(
    playlistUrl,
    loadedMax + 1,
    loadedMax + PLAYLIST_ENTRY_LIMIT,
  );
  if (!page) {
    return c.json({ err: "Could not read more of that playlist" }, 502);
  }
  if (page.id !== playlistId) {
    return c.json(
      { err: "The playlist changed; queue it again to continue" },
      409,
    );
  }

  const existing = new Set<string>(queued.map((entry) => entry.url));
  if (player.url) existing.add(player.url);
  const fresh = page.entries.filter((entry) => !existing.has(entry.url));
  if (fresh.length > 0) {
    // Insert the next page after the playlist's first contiguous run in the
    // upcoming queue, so a playlist doesn't split around manually queued
    // videos at the end of the queue.
    const upcoming = player.queue;
    let insertAt = -1;
    let inRun = false;
    for (let i = 0; i < upcoming.length; i++) {
      if (upcoming[i].playlistId === playlistId) {
        inRun = true;
        insertAt = i + 1;
      } else if (inRun) {
        break;
      }
    }
    if (insertAt < 0) {
      insertAt = player.playlistId === playlistId ? 0 : upcoming.length;
    }
    const order = fresh.map((entry) => entry.url);
    // Record provenance first: a track can start as soon as it is appended.
    rememberQueueSources(
      playlistSources({ ...page, entries: fresh }, playlistUrl),
    );
    if (!(await insertUpcoming(order, insertAt))) {
      return c.json({ err: "Could not insert the playlist page" }, 503);
    }
  }

  return c.json({
    data: "ok",
    added: fresh.length,
    total: page.total,
    loaded: fresh.reduce(
      (max, entry) => Math.max(max, entry.playlistIndex),
      loadedMax,
    ),
  });
});

app.post("/player/queue/clear", async (c) => {
  const ok = await clearQueue();
  if (!ok) {
    return c.json({ err: "Could not clear the queue" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/remove-playlist", async (c) => {
  const body: { playlistId?: unknown } = await c.req
    .json<{ playlistId?: unknown }>()
    .catch(() => ({}));
  const { playlistId } = body;
  if (typeof playlistId !== "string" || !playlistId) {
    return c.json({ err: "playlistId is required" }, 400);
  }
  const ok = await removePlaylistFromQueue(playlistId);
  if (!ok) {
    return c.json({ err: "Could not remove that playlist" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/queue/clear-played", async (c) => {
  const body: { playlistId?: unknown } = await c.req
    .json<{ playlistId?: unknown }>()
    .catch(() => ({}));
  const { playlistId } = body;
  if (playlistId !== undefined && typeof playlistId !== "string") {
    return c.json({ err: "playlistId must be a string" }, 400);
  }
  const ok = await clearPlayedPlaylist(
    typeof playlistId === "string" ? playlistId : undefined,
  );
  if (!ok) {
    return c.json({ err: "Could not clear played tracks" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/clear-error", async (c) => {
  clearPlaybackError();
  return c.json({ data: "ok" });
});

app.post("/player/chapter-prev", async (c) => {
  const ok = await chapterPrev();
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/chapter-next", async (c) => {
  const ok = await chapterNext();
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/seek", async (c) => {
  const { position } = await c.req.json<{ position?: number }>();
  if (
    typeof position !== "number" ||
    !Number.isFinite(position) ||
    position < 0
  ) {
    return c.json({ err: "position must be a non-negative number" }, 400);
  }
  const ok = await seekTo(position);
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/volume", async (c) => {
  const { volume } = await c.req.json<{ volume?: number }>();
  if (typeof volume !== "number" || !Number.isFinite(volume)) {
    return c.json({ err: "volume must be a number" }, 400);
  }
  const ok = await setVolume(volume);
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/mute", async (c) => {
  const ok = await toggleMute();
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/repeat", async (c) => {
  const { mode } = await c.req.json<{ mode?: unknown }>();
  if (mode !== "off" && mode !== "one" && mode !== "all") {
    return c.json({ err: "mode must be off, one, or all" }, 400);
  }
  const ok = await setRepeatMode(mode);
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/speed", async (c) => {
  const { speed } = await c.req.json<{ speed?: number }>();
  if (typeof speed !== "number" || !Number.isFinite(speed)) {
    return c.json({ err: "speed must be a number" }, 400);
  }
  const ok = await setSpeed(speed);
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

app.post("/player/stop", async (c) => {
  const ok = await stopPlayback();
  if (!ok) {
    return c.json({ err: "No mpv instance with IPC connected" }, 409);
  }
  return c.json({ data: "ok" });
});

// --- Remote-control pairing + session management ---

// Pairing presents the master token, so brute-force attempts are throttled
// per source IP (10 failed attempts per minute — generous for humans,
// hostile for scripts). Only FAILED attempts count: a correct pairing is
// never locked out by the limiter.
const pairAttempts = new Map<string, { count: number; window: number }>();

function pairRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = pairAttempts.get(ip);
  if (!entry || now - entry.window > 60000) {
    pairAttempts.set(ip, { count: 1, window: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

// Desktop-only: mint one-time codes for the QR/manual flow. Session tokens
// from paired phones must not be able to mint more codes. `fresh` invalidates
// previously issued unused codes (used by the "New code" action).
app.post("/remote/pairing-codes", async (c) => {
  if (!matchesMasterToken(extractToken(c))) {
    return c.json({ err: "master token required" }, 403);
  }
  let body: { count?: unknown; fresh?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    /* empty body is fine */
  }
  const count = typeof body.count === "number" ? body.count : 1;
  return c.json({
    codes: issuePairingCodes(count, body.fresh === true),
  });
});

app.post("/remote/pair", async (c) => {
  try {
    const ip = getConnInfo(c).remote.address ?? "unknown";
    const { code, device } = await c.req.json<{
      code?: string;
      device?: string;
    }>();
    const result = consumePairingCode(typeof code === "string" ? code : "");
    if (result !== "ok") {
      // Only failed attempts count toward the limiter, so legitimate retries
      // are never locked out — but a burst of wrong codes still hits 429.
      if (pairRateLimited(ip)) {
        return c.json(
          { err: "Too many pairing attempts — try again in a minute." },
          429,
        );
      }
      if (result === "used") {
        return c.json(
          {
            err: "This pairing code was already used — refresh the code in the desktop app.",
          },
          409,
        );
      }
      if (result === "expired") {
        return c.json(
          { err: "This pairing code expired — refresh it in the desktop app." },
          410,
        );
      }
      return c.json({ err: "invalid pairing code" }, 401);
    }
    const session = randomBytes(24).toString("base64url");
    const label =
      typeof device === "string" && device.trim()
        ? device.trim().slice(0, 60)
        : "Remote device";
    createRemoteSession(hashToken(session), label);
    return c.json({ session });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ err: message }, 400);
  }
});

// Phone-side unpair: the caller authenticates with its own session token and
// deletes exactly that session. Master tokens never match a session row.
app.delete("/remote/session", (c) => {
  const provided = extractToken(c);
  if (!provided) {
    return c.json({ err: "unauthorized" }, 401);
  }
  const id = hashToken(provided);
  if (!findRemoteSession(id)) {
    return c.json({ err: "no such session" }, 404);
  }
  deleteRemoteSession(id);
  return c.json({ data: "unpaired" });
});

// Desktop-only session management — these require the master token.
app.get("/remote/sessions", (c) => {
  if (!matchesMasterToken(extractToken(c))) {
    return c.json({ err: "master token required" }, 403);
  }
  return c.json(getRemoteSessions());
});

app.delete("/remote/sessions/:id", (c) => {
  if (!matchesMasterToken(extractToken(c))) {
    return c.json({ err: "master token required" }, 403);
  }
  deleteRemoteSession(c.req.param("id"));
  return c.json(getRemoteSessions());
});

app.delete("/remote/sessions", (c) => {
  if (!matchesMasterToken(extractToken(c))) {
    return c.json({ err: "master token required" }, 403);
  }
  deleteAllRemoteSessions();
  return c.json({ data: "cleared" });
});

app.get("/history", (c) => {
  return c.json(getHistory());
});

app.post("/history", async (c) => {
  try {
    const { url, title, thumbnail, timestamp } = await c.req.json<{
      url?: string;
      title?: string;
      thumbnail?: string;
      timestamp?: number;
    }>();
    if (!isUrl(url)) {
      return c.json({ err: "url must be a valid http(s) URL" }, 400);
    }
    const entry = addHistory(
      url,
      typeof title === "string" ? title : "",
      typeof thumbnail === "string" ? thumbnail : "",
      typeof timestamp === "number" &&
        Number.isFinite(timestamp) &&
        timestamp > 0
        ? timestamp
        : undefined,
    );
    enrichMetadata(entry.id, url);
    return c.json(entry);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ err: message }, 400);
  }
});

app.put("/history/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body =
      await c.req.json<
        Partial<{ title: string; thumbnail: string; position: number }>
      >();
    if (body.title !== undefined && typeof body.title !== "string") {
      return c.json({ err: "title must be a string" }, 400);
    }
    if (body.thumbnail !== undefined && typeof body.thumbnail !== "string") {
      return c.json({ err: "thumbnail must be a string" }, 400);
    }
    if (
      body.position !== undefined &&
      (typeof body.position !== "number" || !Number.isFinite(body.position))
    ) {
      return c.json({ err: "position must be a number" }, 400);
    }
    updateHistoryEntry(id, body);
    return c.json({ data: "updated" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ err: message }, 400);
  }
});

app.delete("/history/:id", (c) => {
  const id = c.req.param("id");
  return c.json(deleteHistory(id));
});

app.delete("/history", (_c) => {
  clearHistory();
  return _c.json({ data: "cleared" });
});

app.get("/settings", (c) => {
  return c.json(getSettings());
});

app.put("/settings", async (c) => {
  try {
    const body = await c.req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ err: "settings body must be an object" }, 400);
    }
    const updated = setSettings(body);
    return c.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ err: message }, 400);
  }
});

export default app;
