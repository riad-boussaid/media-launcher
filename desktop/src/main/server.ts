import express from "express";
import { launchPlayer } from "./player";
import { addHistory, updateHistoryEntry, getHistory, deleteHistory, getSettings } from "./store";
import { fetchMetadata } from "./metadata";
import type { Server } from "http";

function enrichMetadata(historyId: string, url: string): void {
  fetchMetadata(url).then((meta) => {
    if (meta.title || meta.thumbnail) {
      updateHistoryEntry(historyId, meta);
    }
  });
}

let server: Server | null = null;

export function startServer(port: number): void {
  if (server) return;

  const app = express();
  app.use(express.json());

  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    return res.status(200).json({ app: "media-launcher" });
  });

  app.post("/", async (req, res) => {
    try {
      const { url, options } = req.body;
      if (!url) {
        return res.status(400).json({ err: "url is required" });
      }
      const result = await launchPlayer(url, options ?? [], getSettings());
      if (!result.success) {
        return res.status(503).json({ err: result.error });
      }
      const entry = addHistory(url);
      enrichMetadata(entry.id, url);
      return res.status(200).json({ data: "success" });
    } catch (err: any) {
      console.error(err.message);
      return res.status(500).json({ err: err.message });
    }
  });

  app.get("/history", (_req, res) => {
    return res.status(200).json(getHistory());
  });

  app.delete("/history/:id", (req, res) => {
    return res.status(200).json(deleteHistory(req.params.id));
  });

  server = app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
