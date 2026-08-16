import { Hono } from "hono";
import {
  addHistory,
  clearHistory,
  deleteHistory,
  getHistory,
  getSettings,
  setSettings,
  updateHistoryEntry,
} from "./db.js";
import { fetchMetadata } from "./metadata.js";
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
  return (
    Array.isArray(value) && value.every((o) => typeof o === "string")
  );
}

app.get("/api/health", (c) => {
  return c.json({ app: "media-launcher", pid: process.pid });
});

app.post("/", async (c) => {
  try {
    const { url, options } = await c.req.json<{
      url?: string;
      options?: string[];
    }>();
    if (!isUrl(url)) {
      return c.json({ err: "url must be a valid http(s) URL" }, 400);
    }
    if (!isOptions(options)) {
      return c.json({ err: "options must be an array of strings" }, 400);
    }
    const result = await launchPlayer(url, options ?? []);
    if (!result.success) {
      return c.json({ err: result.error }, 503);
    }
    const entry = addHistory(url);
    enrichMetadata(entry.id, url);
    return c.json({ data: "success" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return c.json({ err: message }, 500);
  }
});

app.get("/history", (c) => {
  return c.json(getHistory());
});

app.post("/history", async (c) => {
  try {
    const { url, title, thumbnail } = await c.req.json<{
      url?: string;
      title?: string;
      thumbnail?: string;
    }>();
    if (!isUrl(url)) {
      return c.json({ err: "url must be a valid http(s) URL" }, 400);
    }
    const entry = addHistory(url, title ?? "", thumbnail ?? "");
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
      await c.req.json<Partial<{ title: string; thumbnail: string }>>();
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