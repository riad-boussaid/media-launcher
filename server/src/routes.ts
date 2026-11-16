import { randomBytes } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import {
  consumePairingCode,
  extractToken,
  hashToken,
  issuePairingCode,
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
  getPlayerStatus,
  playNow,
  queueUrl,
  registerPlayer,
  seekTo,
  setSpeed,
  setVolume,
  skipTrack,
  stopPlayback,
  toggleMute,
  togglePause,
} from "./player-ipc.js";
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

app.get("/api/health", (c) => {
  return c.json({
    app: "media-launcher",
    pid: process.pid,
    version: SERVER_VERSION,
    apiVersion: API_VERSION,
  });
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

    const settings = getSettings();
    const isMpv = (settings.player || "mpv") === "mpv";
    const player = getPlayerStatus();

    // An mpv instance is already playing — enqueue, or replace it in place.
    if (isMpv && player.alive && player.ipcReady) {
      const ok = queue === true ? await queueUrl(url) : await playNow(url);
      if (!ok) {
        return c.json(
          { err: "Could not control the running mpv instance" },
          503,
        );
      }
      const entry = addHistory(
        url,
        typeof title === "string" ? title : "",
        typeof thumbnail === "string" ? thumbnail : "",
      );
      enrichMetadata(entry.id, url);
      return c.json({ data: queue ? "queued" : "success" });
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
    const entry = addHistory(
      url,
      typeof title === "string" ? title : "",
      typeof thumbnail === "string" ? thumbnail : "",
    );
    enrichMetadata(entry.id, url);
    return c.json({ data: "success" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return c.json({ err: message }, 500);
  }
});

app.get("/player", (c) => {
  return c.json(getPlayerStatus());
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

// Desktop-only: mint a one-time pairing code for the QR/manual flow. Session
// tokens from paired phones must not be able to mint more codes.
app.post("/remote/pairing-code", (c) => {
  if (!matchesMasterToken(extractToken(c))) {
    return c.json({ err: "master token required" }, 403);
  }
  return c.json(issuePairingCode());
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
