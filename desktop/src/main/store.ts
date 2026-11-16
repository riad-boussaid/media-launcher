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
  remoteEnabled: boolean;
}

export interface PlayerQueueEntry {
  url: string;
  title: string;
}

export interface PlayerChapter {
  title: string;
  time: number;
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
  chapters: PlayerChapter[];
  chapter: number | null;
  volume: number;
  muted: boolean;
  speed: number;
}

const DEFAULT_SERVER_URL = "http://localhost:5000";

function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function localConfigPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function readLocalConfig(): { serverUrl: string; remoteEnabled: boolean } {
  const path = localConfigPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
        serverUrl?: string;
        remoteEnabled?: boolean;
      };
      return {
        serverUrl: normalizeServerUrl(
          typeof parsed.serverUrl === "string"
            ? parsed.serverUrl
            : DEFAULT_SERVER_URL,
        ),
        remoteEnabled: parsed.remoteEnabled === true,
      };
    } catch {
      return { serverUrl: DEFAULT_SERVER_URL, remoteEnabled: false };
    }
  }
  return { serverUrl: DEFAULT_SERVER_URL, remoteEnabled: false };
}

function writeLocalConfig(patch: {
  serverUrl?: string;
  remoteEnabled?: boolean;
}): void {
  const current = readLocalConfig();
  writeFileSync(
    localConfigPath(),
    JSON.stringify(
      {
        serverUrl:
          patch.serverUrl !== undefined
            ? normalizeServerUrl(patch.serverUrl)
            : current.serverUrl,
        remoteEnabled:
          patch.remoteEnabled !== undefined
            ? patch.remoteEnabled
            : current.remoteEnabled,
      },
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
  return (await res.json()) as T;
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

/** Shape of the server's /settings payload (all optional for defensive reads). */
interface ServerSettingsPayload {
  player?: string;
  playerArgs?: Record<string, string>;
  customPlayerPath?: string;
  customPlayerArgs?: string;
  binDir?: string;
  autoStart?: boolean;
  startMinimized?: boolean;
  resumePlayback?: boolean;
  remoteEnabled?: boolean;
}

export async function getSettings(): Promise<Settings> {
  const local = readLocalConfig();
  try {
    const serverSettings = await api<ServerSettingsPayload>("/settings");
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
      remoteEnabled: local.remoteEnabled,
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
      remoteEnabled: local.remoteEnabled,
    };
  }
}

export async function setSettings(
  partial: Partial<Settings>,
): Promise<Settings> {
  const prevUrl = getServerUrl();

  if (partial.remoteEnabled !== undefined) {
    // Local config is the source of truth for the server's bind address.
    writeLocalConfig({ remoteEnabled: partial.remoteEnabled });
  }

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
  if (partial.remoteEnabled !== undefined)
    serverPayload.remoteEnabled = partial.remoteEnabled;

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
      chapters: [],
      chapter: null,
      volume: 0,
      muted: false,
      speed: 1,
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

export async function chapterPrev(): Promise<boolean> {
  try {
    await api("/player/chapter-prev", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function chapterNext(): Promise<boolean> {
  try {
    await api("/player/chapter-next", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function seekTo(position: number): Promise<boolean> {
  try {
    await api("/player/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function setVolume(volume: number): Promise<boolean> {
  try {
    await api("/player/volume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volume }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function toggleMute(): Promise<boolean> {
  try {
    await api("/player/mute", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function setSpeed(speed: number): Promise<boolean> {
  try {
    await api("/player/speed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopPlayback(): Promise<boolean> {
  try {
    await api("/player/stop", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export interface RemoteSessionInfo {
  id: string;
  device: string;
  createdAt: number;
  lastSeen: number;
}

export async function getRemoteSessions(): Promise<RemoteSessionInfo[]> {
  try {
    return await api<RemoteSessionInfo[]>("/remote/sessions");
  } catch {
    return [];
  }
}

export async function revokeRemoteSession(
  id: string,
): Promise<RemoteSessionInfo[]> {
  return api<RemoteSessionInfo[]>(`/remote/sessions/${id}`, {
    method: "DELETE",
  });
}

export async function revokeAllRemoteSessions(): Promise<void> {
  await api("/remote/sessions", { method: "DELETE" });
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
