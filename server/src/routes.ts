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
  fetchMetadata(url).then((meta) => {
    if (meta.title || meta.thumbnail) {
      updateHistoryEntry(historyId, meta);
    }
  });
}

app.get("/api/health", (c) => {
  return c.json({ app: "media-launcher" });
});

app.post("/", async (c) => {
  try {
    const { url, options } = await c.req.json<{
      url?: string;
      options?: string[];
    }>();
    if (!url) {
      return c.json({ err: "url is required" }, 400);
    }
    const result = launchPlayer(url, options ?? []);
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
  const { url, title, thumbnail } = await c.req.json<{
    url?: string;
    title?: string;
    thumbnail?: string;
  }>();
  if (!url) {
    return c.json({ err: "url is required" }, 400);
  }
  const entry = addHistory(url, title, thumbnail);
  enrichMetadata(entry.id, url);
  return c.json(entry);
});

app.put("/history/:id", async (c) => {
  const id = c.req.param("id");
  const body =
    await c.req.json<Partial<{ title: string; thumbnail: string }>>();
  updateHistoryEntry(id, body);
  return c.json({ data: "updated" });
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
  const body = await c.req.json();
  const updated = setSettings(body);
  return c.json(updated);
});

export default app;
