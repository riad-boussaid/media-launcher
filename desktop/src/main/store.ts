import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  getServerUrl as getEmbeddedServerUrl,
  readServerToken,
} from "./server";

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
  position: number;
  duration?: number;
  completed?: boolean;
  liveStatus?: string;
  isShort?: boolean;
}

export interface WatchLaterEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  addedAt: number;
  position?: number;
  duration?: number;
  completed?: boolean;
  lastPlayedAt?: number;
  liveStatus?: string;
  isShort?: boolean;
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
  index: number;
  url: string;
  title: string;
  thumbnail: string;
  source: "queue" | "playlist";
  playlistId: string | null;
  playlistTitle: string | null;
  playlistUrl: string | null;
  playlistTotal: number | null;
  playlistTruncated: boolean;
  playlistIndex: number | null;
}

export interface PlaybackError {
  url: string;
  title: string;
  playlistTitle: string | null;
  playlistIndex: number | null;
  message: string;
}

export interface SavedQueueEntry {
  url: string;
  title: string;
  thumbnail: string;
  source: "queue" | "playlist";
  playlistId: string | null;
  playlistTitle: string | null;
  playlistUrl: string | null;
  playlistTotal: number | null;
  playlistTruncated: boolean;
  playlistIndex: number | null;
}

export interface SavedQueue {
  savedAt: number;
  current: SavedQueueEntry | null;
  entries: SavedQueueEntry[];
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
  thumbnail: string;
  source: "queue" | "playlist" | null;
  playlistId: string | null;
  playlistTitle: string | null;
  playlistUrl: string | null;
  playlistTotal: number | null;
  playlistTruncated: boolean;
  playlistIndex: number | null;
  error: PlaybackError | null;
  position: number;
  duration: number;
  live: boolean;
  paused: boolean;
  queue: PlayerQueueEntry[];
  past: PlayerQueueEntry[];
  chapters: PlayerChapter[];
  chapter: number | null;
  volume: number;
  muted: boolean;
  speed: number;
  repeat: "off" | "one" | "all";
}

function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Configs written before the embedded server gained port fallback keep
 * `localhost:5000`. Follow the port the desktop actually selected instead of
 * staying pinned to an occupied port (macOS AirPlay commonly owns 5000).
 * Explicit non-loopback or custom-port URLs are preserved.
 */
function followActivePort(url: string): string {
  try {
    const parsed = new URL(url);
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    return isLoopback && parsed.port === "5000" ? getEmbeddedServerUrl() : url;
  } catch {
    return url;
  }
}

function localConfigPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function readLocalConfig(): {
  serverUrl: string;
  remoteEnabled: boolean;
  autoUpdateYtDlp: boolean;
} {
  const path = localConfigPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
        serverUrl?: string;
        remoteEnabled?: boolean;
        autoUpdateYtDlp?: boolean;
      };
      return {
        serverUrl: normalizeServerUrl(
          followActivePort(
            typeof parsed.serverUrl === "string"
              ? parsed.serverUrl
              : getEmbeddedServerUrl(),
          ),
        ),
        remoteEnabled: parsed.remoteEnabled === true,
        autoUpdateYtDlp: parsed.autoUpdateYtDlp !== false,
      };
    } catch {
      return {
        serverUrl: getEmbeddedServerUrl(),
        remoteEnabled: false,
        autoUpdateYtDlp: true,
      };
    }
  }
  return {
    serverUrl: getEmbeddedServerUrl(),
    remoteEnabled: false,
    autoUpdateYtDlp: true,
  };
}

function writeLocalConfig(patch: {
  serverUrl?: string;
  remoteEnabled?: boolean;
  autoUpdateYtDlp?: boolean;
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
        autoUpdateYtDlp:
          patch.autoUpdateYtDlp !== undefined
            ? patch.autoUpdateYtDlp
            : current.autoUpdateYtDlp,
      },
      null,
      2,
    ),
  );
}

export function getAutoUpdateYtDlp(): boolean {
  return readLocalConfig().autoUpdateYtDlp;
}

export function setAutoUpdateYtDlp(enabled: boolean): void {
  writeLocalConfig({ autoUpdateYtDlp: enabled });
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

export async function getWatchLater(): Promise<WatchLaterEntry[]> {
  return api<WatchLaterEntry[]>("/watch-later");
}

export async function addWatchLater(
  url: string,
  title = "",
  thumbnail = "",
  addedAt?: number,
): Promise<WatchLaterEntry> {
  return api<WatchLaterEntry>("/watch-later", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title, thumbnail, addedAt }),
  });
}

export async function reorderWatchLater(
  ids: string[],
): Promise<WatchLaterEntry[]> {
  return api<WatchLaterEntry[]>("/watch-later/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function resetWatchLaterProgress(
  id: string,
): Promise<WatchLaterEntry[]> {
  return api<WatchLaterEntry[]>(
    `/watch-later/${encodeURIComponent(id)}/unwatch`,
    { method: "POST" },
  );
}

export async function deleteWatchLater(id: string): Promise<WatchLaterEntry[]> {
  return api<WatchLaterEntry[]>(`/watch-later/${id}`, { method: "DELETE" });
}

export async function clearWatchLater(): Promise<void> {
  await api("/watch-later", { method: "DELETE" });
}

export interface WatchLaterActionResult {
  success: boolean;
  count?: number;
  total?: number;
  error?: string;
}

async function watchLaterAction(
  path: string,
  ids?: string[],
): Promise<WatchLaterActionResult> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = readServerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${getServerUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const error =
        typeof data === "object" &&
        data !== null &&
        "err" in data &&
        typeof data.err === "string"
          ? data.err
          : res.statusText;
      return { success: false, error };
    }
    return {
      success: true,
      count:
        typeof data === "object" &&
        data !== null &&
        "count" in data &&
        typeof data.count === "number"
          ? data.count
          : undefined,
      total:
        typeof data === "object" &&
        data !== null &&
        "total" in data &&
        typeof data.total === "number"
          ? data.total
          : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function playWatchLater(
  ids?: string[],
): Promise<WatchLaterActionResult> {
  return watchLaterAction("/watch-later/play", ids);
}

export async function queueWatchLater(
  ids?: string[],
): Promise<WatchLaterActionResult> {
  return watchLaterAction("/watch-later/queue", ids);
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
      thumbnail: "",
      source: null,
      playlistId: null,
      playlistTitle: null,
      playlistUrl: null,
      playlistTotal: null,
      playlistTruncated: false,
      playlistIndex: null,
      error: null,
      position: 0,
      duration: 0,
      live: false,
      paused: false,
      queue: [],
      past: [],
      chapters: [],
      chapter: null,
      volume: 0,
      muted: false,
      speed: 1,
      repeat: "off",
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

export async function removeQueueItem(index: number): Promise<boolean> {
  try {
    await api("/player/queue/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function moveQueueItem(
  index: number,
  direction: "up" | "down",
): Promise<boolean> {
  try {
    await api("/player/queue/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, direction }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function moveQueueItemTo(
  index: number,
  target: number,
): Promise<boolean> {
  try {
    await api("/player/queue/move-to", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, target }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function shuffleQueue(): Promise<boolean> {
  try {
    await api("/player/queue/shuffle", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function setRepeatMode(
  mode: "off" | "one" | "all",
): Promise<boolean> {
  try {
    await api("/player/repeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function playQueueItem(index: number): Promise<boolean> {
  try {
    await api("/player/queue/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadMorePlaylist(
  playlistUrl: string,
  playlistId: string,
): Promise<boolean> {
  try {
    await api("/player/queue/load-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistUrl, playlistId }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function getSavedQueue(): Promise<SavedQueue | null> {
  try {
    return await api<SavedQueue | null>("/player/saved-queue");
  } catch {
    return null;
  }
}

export async function restoreSavedQueue(): Promise<boolean> {
  try {
    await api("/player/queue/restore", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function discardSavedQueue(): Promise<boolean> {
  try {
    await api("/player/saved-queue", { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

export async function clearQueue(): Promise<boolean> {
  try {
    await api("/player/queue/clear", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export async function removePlaylistFromQueue(
  playlistId: string,
): Promise<boolean> {
  try {
    await api("/player/queue/remove-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearPlayedPlaylist(
  playlistId?: string,
): Promise<boolean> {
  try {
    await api("/player/queue/clear-played", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(playlistId ? { playlistId } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearPlaybackError(): Promise<boolean> {
  try {
    await api("/player/clear-error", { method: "POST" });
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

async function sendUrl(
  url: string,
  queue: boolean,
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
      body: JSON.stringify({ url, queue }),
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

export async function replayUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  return sendUrl(url, false);
}

export async function queueUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  // The server treats queue=true as "play" when no player is running. Refuse
  // that here so queueing from history never unexpectedly starts playback.
  try {
    const status = await api<PlayerStatus>("/player");
    if (!status.alive || !status.ipcReady) {
      return {
        success: false,
        error: "Start a video before queueing another.",
      };
    }
  } catch {
    return { success: false, error: "Could not reach the player." };
  }
  return sendUrl(url, true);
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
