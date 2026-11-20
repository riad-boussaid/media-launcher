import { discoverServer } from "@shared/discovery";
import { ext } from "@shared/ext";
import {
  defaultSettings,
  getAuthToken,
  getSettings,
} from "@shared/settings";
import { getStartSeconds } from "@shared/url";

let cachedServerUrl: string | null = null;

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.serverUrl) {
    cachedServerUrl = null;
  }
});

export async function getServerUrl(): Promise<string | null> {
  if (cachedServerUrl) return cachedServerUrl;

  const opts = await ext.storage.sync.get({
    serverUrl: defaultSettings.serverUrl,
  });
  const preferredUrl =
    opts.serverUrl !== defaultSettings.serverUrl ? opts.serverUrl : undefined;

  const result = await discoverServer(preferredUrl);
  if (result) {
    cachedServerUrl = result.serverUrl;
    if (opts.serverUrl === defaultSettings.serverUrl) {
      await ext.storage.sync.set({ serverUrl: result.serverUrl });
    }
    return result.serverUrl;
  }

  return opts.serverUrl;
}

export interface SendResult {
  success: boolean;
  error?: string;
  /** Number of entries added when queueing (a playlist may add many). */
  queuedCount?: number;
  playlistTitle?: string;
}

export interface ServerHealthInfo {
  ok: boolean;
  version?: string;
  apiVersion?: number;
}

export async function getServerHealthInfo(): Promise<ServerHealthInfo> {
  const url = await getServerUrl();
  if (!url) return { ok: false };
  try {
    const res = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      app?: unknown;
      version?: unknown;
      apiVersion?: unknown;
    };
    if (data.app !== "media-launcher") return { ok: false };
    return {
      ok: true,
      version: typeof data.version === "string" ? data.version : undefined,
      apiVersion:
        typeof data.apiVersion === "number" ? data.apiVersion : undefined,
    };
  } catch {
    return { ok: false };
  }
}

export async function checkServerHealth(): Promise<boolean> {
  return (await getServerHealthInfo()).ok;
}

const CODEC_PREFIXES: Record<string, string[]> = {
  h264: ["avc1"],
  vp9: ["vp09"],
  av1: ["av01"],
  h265: ["hvc1", "hev1"],
};

export async function sendUrl(
  url: string,
  title?: string,
  queue?: boolean,
): Promise<SendResult> {
  const opts = await getSettings();
  const mpvArgs: string[] = [];

  if (opts.maxHeight === "a") {
    mpvArgs.push("--ytdl-format=ba");
    if (opts.showThumb) {
      mpvArgs.push("--script-opts=ytdl_hook-thumbnails=best");
    }
  } else {
    const base = `bestvideo[height<=${opts.maxHeight}]+bestaudio`;
    const prefixes =
      opts.codec && opts.codec !== "any" ? CODEC_PREFIXES[opts.codec] : null;
    if (prefixes) {
      const selectors = prefixes.map(
        (p) => `bestvideo[height<=${opts.maxHeight}][vcodec^=${p}]+bestaudio`,
      );
      mpvArgs.push(`--ytdl-format=${selectors.join("/")}/${base}/best`);
    } else {
      mpvArgs.push(`--ytdl-format=${base}/best`);
    }
  }

  // Auto flags come before custom args so the user's extra MPV arguments win
  // (mpv uses last-flag-wins).
  if (opts.volume !== 100) mpvArgs.push(`--volume=${opts.volume}`);
  if (opts.speed !== 1) mpvArgs.push(`--speed=${opts.speed}`);
  if (opts.subLang) mpvArgs.push(`--sub-lang=${opts.subLang}`);
  if (opts.loop) mpvArgs.push("--loop-file=inf");
  const start = getStartSeconds(url);
  if (start !== null) mpvArgs.push(`--start=${start}`);

  const customArgs = opts.mpvArgs
    ? opts.mpvArgs.split(/\r?\n/).filter(Boolean)
    : [];
  mpvArgs.push(...customArgs);

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    return { success: false, error: "Server not found. Check options." };
  }

  try {
    const token = opts.authToken;
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, options: mpvArgs, title, queue }),
      // Playlist URLs are resolved server-side with yt-dlp before the request
      // completes, which can take longer than a single-video send.
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 401) {
      return {
        success: false,
        error: "Unauthorized — paste the server token in options.",
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { err?: unknown };
        if (typeof parsed.err === "string") detail = parsed.err;
      } catch {
        /* keep the raw body */
      }
      return {
        success: false,
        error: detail || `Server error: ${res.status}`,
      };
    }

    const data: unknown = await res.json().catch(() => null);
    const playlist =
      data && typeof data === "object" && "playlist" in data
        ? (data as {
            playlist?: { count?: unknown; title?: unknown } | null;
          }).playlist
        : null;
    const queuedCount =
      queue === true
        ? typeof playlist?.count === "number"
          ? playlist.count
          : 1
        : undefined;
    return {
      success: true,
      queuedCount,
      playlistTitle:
        typeof playlist?.title === "string" ? playlist.title : undefined,
    };
  } catch (error) {
    // The cached server URL is stale — clear it so the next call re-discovers.
    cachedServerUrl = null;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        success: false,
        error: "Request timed out. Is the server running?",
      };
    }
    return {
      success: false,
      error: `Connection failed: ${(error as Error).message}`,
    };
  }
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
  liveStatus?: string;
  isShort?: boolean;
}

/** Server watch history, or null when the server can't be reached. */
export async function getServerHistory(): Promise<HistoryEntry[] | null> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return null;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/history`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as HistoryEntry[]) : null;
  } catch {
    // The cached server URL may be stale — clear it so the next call re-discovers.
    cachedServerUrl = null;
    return null;
  }
}

/** Deletes one entry; returns the fresh history, or null on failure. */
export async function deleteServerHistory(
  id: string,
): Promise<HistoryEntry[] | null> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return null;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/history/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as HistoryEntry[]) : null;
  } catch {
    cachedServerUrl = null;
    return null;
  }
}

export async function clearServerHistory(): Promise<boolean> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return false;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/history`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    cachedServerUrl = null;
    return false;
  }
}

/** Records an entry (legacy-history migration); timestamp kept if provided. */
export async function addServerHistory(entry: {
  url: string;
  title?: string;
  thumbnail?: string;
  timestamp?: number;
}): Promise<boolean> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return false;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
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

/** Saved videos, or null when the server can't be reached. */
export async function getServerWatchLater(): Promise<
  WatchLaterEntry[] | null
> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return null;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/watch-later`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as WatchLaterEntry[]) : null;
  } catch {
    cachedServerUrl = null;
    return null;
  }
}

/** Saves a URL; returns the server's entry (idempotent by URL), or null. */
export async function addServerWatchLater(entry: {
  url: string;
  title?: string;
  thumbnail?: string;
}): Promise<WatchLaterEntry | null> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return null;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/watch-later`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return data && typeof data === "object"
      ? (data as WatchLaterEntry)
      : null;
  } catch {
    cachedServerUrl = null;
    return null;
  }
}

/** Removes one saved video; returns the fresh list, or null on failure. */
export async function deleteServerWatchLater(
  id: string,
): Promise<WatchLaterEntry[] | null> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return null;
  try {
    const token = await getAuthToken();
    const res = await fetch(
      `${serverUrl}/watch-later/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as WatchLaterEntry[]) : null;
  } catch {
    cachedServerUrl = null;
    return null;
  }
}

export async function clearServerWatchLater(): Promise<boolean> {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return false;
  try {
    const token = await getAuthToken();
    const res = await fetch(`${serverUrl}/watch-later`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    cachedServerUrl = null;
    return false;
  }
}
