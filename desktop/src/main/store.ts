import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
}

export interface Settings {
  serverUrl: string;
  player: string;
  playerArgs: Record<string, string>;
  customPlayerPath: string;
  customPlayerArgs: string;
  binDir: string;
  autoStart: boolean;
  startMinimized: boolean;
}

const DEFAULT_SERVER_URL = "http://localhost:5000";

function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function localConfigPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function readLocalConfig(): { serverUrl: string } {
  const path = localConfigPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
        serverUrl?: string;
      };
      return {
        serverUrl: normalizeServerUrl(
          typeof parsed.serverUrl === "string"
            ? parsed.serverUrl
            : DEFAULT_SERVER_URL,
        ),
      };
    } catch {
      return { serverUrl: DEFAULT_SERVER_URL };
    }
  }
  return { serverUrl: DEFAULT_SERVER_URL };
}

function writeLocalConfig(config: { serverUrl: string }): void {
  writeFileSync(
    localConfigPath(),
    JSON.stringify(
      { serverUrl: normalizeServerUrl(config.serverUrl) },
      null,
      2,
    ),
  );
}

function getServerUrl(): string {
  return readLocalConfig().serverUrl;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getServerUrl()}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

export async function initDatabase(): Promise<void> {
  // No local database needed — the server owns all data.
  // We just verify the server is reachable.
  try {
    await api<{ app: string }>("/api/health");
  } catch {
    console.warn("Server not reachable at", getServerUrl());
  }
}

export async function getSettings(): Promise<Settings> {
  const local = readLocalConfig();
  try {
    const serverSettings = await api<Record<string, unknown>>("/settings");
    return {
      serverUrl: local.serverUrl,
      player: serverSettings.player ?? "mpv",
      playerArgs: serverSettings.playerArgs ?? {},
      customPlayerPath: serverSettings.customPlayerPath ?? "",
      customPlayerArgs: serverSettings.customPlayerArgs ?? "{url}",
      binDir: serverSettings.binDir ?? "",
      autoStart: serverSettings.autoStart ?? false,
      startMinimized: serverSettings.startMinimized ?? false,
    };
  } catch {
    return {
      serverUrl: local.serverUrl,
      player: "mpv",
      playerArgs: {},
      customPlayerPath: "",
      customPlayerArgs: "{url}",
      binDir: "",
      autoStart: false,
      startMinimized: false,
    };
  }
}

export async function setSettings(
  partial: Partial<Settings>,
): Promise<Settings> {
  const prevUrl = getServerUrl();

  if (partial.serverUrl !== undefined) {
    const nextUrl = normalizeServerUrl(partial.serverUrl);
    writeLocalConfig({ serverUrl: nextUrl });
    try {
      const res = await fetch(`${nextUrl}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      writeLocalConfig({ serverUrl: prevUrl });
      throw new Error(`Server unreachable at ${nextUrl}`);
    }
  }

  const serverPayload: Record<string, unknown> = {};
  if (partial.player !== undefined) serverPayload.player = partial.player;
  if (partial.playerArgs !== undefined)
    serverPayload.playerArgs = partial.playerArgs;
  if (partial.customPlayerPath !== undefined)
    serverPayload.customPlayerPath = partial.customPlayerPath;
  if (partial.customPlayerArgs !== undefined)
    serverPayload.customPlayerArgs = partial.customPlayerArgs;
  if (partial.binDir !== undefined) serverPayload.binDir = partial.binDir;
  if (partial.autoStart !== undefined)
    serverPayload.autoStart = partial.autoStart;
  if (partial.startMinimized !== undefined)
    serverPayload.startMinimized = partial.startMinimized;

  if (Object.keys(serverPayload).length > 0) {
    await api<Record<string, unknown>>("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serverPayload),
    });
  }

  return getSettings();
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return api<HistoryEntry[]>("/history");
}

export async function getNowPlaying(): Promise<HistoryEntry | null> {
  const history = await api<HistoryEntry[]>("/history");
  return history[0] ?? null;
}

export async function replayUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${getServerUrl()}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null);
      const error =
        typeof data === "object" &&
        data !== null &&
        "err" in data &&
        typeof data.err === "string"
          ? data.err
          : res.statusText;
      return { success: false, error };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function addHistory(
  url: string,
  title = "",
  thumbnail = "",
): Promise<HistoryEntry> {
  return api<HistoryEntry>("/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title, thumbnail }),
  });
}

export async function deleteHistory(id: string): Promise<HistoryEntry[]> {
  return api<HistoryEntry[]>(`/history/${id}`, { method: "DELETE" });
}

export async function clearHistory(): Promise<void> {
  await api("/history", { method: "DELETE" });
}

export async function updateHistoryEntry(
  id: string,
  partial: Partial<Pick<HistoryEntry, "title" | "thumbnail">>,
): Promise<void> {
  await api(`/history/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
}

export function getServerUrlSync(): string {
  return getServerUrl();
}
