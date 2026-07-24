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
  mpvArgs: string;
  playerArgs: Record<string, string>;
  customPlayerPath: string;
  customPlayerArgs: string;
  autoStart: boolean;
  startMinimized: boolean;
}

const DEFAULT_SERVER_URL = "http://localhost:5000";

function localConfigPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function readLocalConfig(): { serverUrl: string } {
  const path = localConfigPath();
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      return { serverUrl: DEFAULT_SERVER_URL };
    }
  }
  return { serverUrl: DEFAULT_SERVER_URL };
}

function writeLocalConfig(config: { serverUrl: string }): void {
  writeFileSync(localConfigPath(), JSON.stringify(config, null, 2));
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
      mpvArgs: serverSettings.mpvArgs ?? "",
      playerArgs: serverSettings.playerArgs ?? {},
      customPlayerPath: serverSettings.customPlayerPath ?? "",
      customPlayerArgs: serverSettings.customPlayerArgs ?? "{url}",
      autoStart: serverSettings.autoStart ?? false,
      startMinimized: serverSettings.startMinimized ?? false,
    };
  } catch {
    return {
      serverUrl: local.serverUrl,
      player: "mpv",
      mpvArgs: "",
      playerArgs: {},
      customPlayerPath: "",
      customPlayerArgs: "{url}",
      autoStart: false,
      startMinimized: false,
    };
  }
}

export async function setSettings(
  partial: Partial<Settings>,
): Promise<Settings> {
  if (partial.serverUrl !== undefined) {
    writeLocalConfig({ serverUrl: partial.serverUrl });
  }

  const serverPayload: Record<string, unknown> = {};
  if (partial.player !== undefined) serverPayload.player = partial.player;
  if (partial.mpvArgs !== undefined) serverPayload.mpvArgs = partial.mpvArgs;
  if (partial.playerArgs !== undefined)
    serverPayload.playerArgs = partial.playerArgs;
  if (partial.customPlayerPath !== undefined)
    serverPayload.customPlayerPath = partial.customPlayerPath;
  if (partial.customPlayerArgs !== undefined)
    serverPayload.customPlayerArgs = partial.customPlayerArgs;
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
