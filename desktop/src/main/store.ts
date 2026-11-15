import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { readServerToken } from "./server";

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
  position: number;
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
  resumePlayback: boolean;
}

export interface PlayerQueueEntry {
  url: string;
  title: string;
}

export interface PlayerStatus {
  supported: boolean;
  alive: boolean;
  ipcReady: boolean;
  url: string | null;
  title: string;
  position: number;
  duration: number;
  paused: boolean;
  queue: PlayerQueueEntry[];
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
  const headers = new Headers(init?.headers);
  const token = readServerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${getServerUrl()}${path}`, { ...init, headers });
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
      resumePlayback: serverSettings.resumePlayback ?? true,
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
      resumePlayback: true,
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
  if (partial.resumePlayback !== undefined)
    serverPayload.resumePlayback = partial.resumePlayback;

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

export async function getPlayerStatus(): Promise<PlayerStatus> {
  try {
    return await api<PlayerStatus>("/player");
  } catch {
    return {
      supported: false,
      alive: false,
      ipcReady: false,
      url: null,
      title: "",
      position: 0,
      duration: 0,
      paused: false,
      queue: [],
    };
  }
}

export async function togglePause(): Promise<boolean> {
  try {
    await api("/player/pause", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function skipTrack(): Promise<boolean> {
  try {
    await api("/player/skip", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function replayUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = readServerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${getServerUrl()}/`, {
      method: "POST",
      headers,
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
