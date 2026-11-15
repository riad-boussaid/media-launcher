import { Hono } from "hono";
import {
  addHistory,
  clearHistory,
  deleteHistory,
  getHistory,
  getHistoryPosition,
  getSettings,
  setSettings,
  updateHistoryEntry,
} from "./db.js";
import { fetchMetadata } from "./metadata.js";
import {
  getPlayerStatus,
  playNow,
  queueUrl,
  registerPlayer,
  skipTrack,
  togglePause,
} from "./player-ipc.js";
import { launchPlayer } from "./player.js";

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
  return c.json({ app: "media-launcher", pid: process.pid });
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
      typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
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
      await c.req.json<Partial<{ title: string; thumbnail: string; position: number }>>();
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
