import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { getSettings } from "./db.js";
import { findYtDlp } from "./metadata.js";

// Playlists are resolved explicitly instead of letting mpv's ytdl_hook handle
// them: the hook defaults to --no-playlist and drops all track metadata. A
// flat yt-dlp listing gives us URLs, titles, and thumbnails up front.

export const PLAYLIST_ENTRY_LIMIT = 200;
const RESOLVE_TIMEOUT_MS = 25_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface PlaylistVideo {
  url: string;
  title: string;
  thumbnail: string;
  /** 1-based position in the source playlist. */
  playlistIndex: number;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  entries: PlaylistVideo[];
  /** Total tracks reported by the source, which may exceed entries.length. */
  total: number;
  truncated: boolean;
}

interface RawEntry {
  id?: unknown;
  url?: unknown;
  webpage_url?: unknown;
  title?: unknown;
  thumbnail?: unknown;
  thumbnails?: unknown;
  playlist_index?: unknown;
  availability?: unknown;
  is_unavailable?: unknown;
}

interface RawPlaylist {
  id?: unknown;
  title?: unknown;
  playlist_count?: unknown;
  entries?: unknown;
}

const cache = new Map<string, { expires: number; info: PlaylistInfo }>();
const inflight = new Map<string, Promise<PlaylistInfo | null>>();

function youtubeHost(host: string): boolean {
  const bare = host.replace(/^www\./, "");
  return (
    bare === "youtube.com" ||
    bare.endsWith(".youtube.com") ||
    bare === "youtu.be"
  );
}

export function isPlaylistUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (youtubeHost(host)) {
      return url.searchParams.has("list") || url.pathname === "/playlist";
    }
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      return /\/albums\//.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

function rawThumbnail(entry: RawEntry): string {
  if (typeof entry.thumbnail === "string" && entry.thumbnail) {
    return entry.thumbnail;
  }
  if (Array.isArray(entry.thumbnails)) {
    for (let i = entry.thumbnails.length - 1; i >= 0; i--) {
      const thumb = entry.thumbnails[i] as { url?: unknown };
      if (thumb && typeof thumb.url === "string" && thumb.url) {
        return thumb.url;
      }
    }
  }
  return "";
}

const UNAVAILABLE_TITLE =
  /^(private video|deleted video|\[private video\]|\[deleted video\])$/i;
const UNAVAILABLE_AVAILABILITY = new Set([
  "private",
  "needs_auth",
  "premium",
  "subscriber_only",
  "unavailable",
]);

function isUnavailable(entry: RawEntry): boolean {
  if (entry.is_unavailable === true) return true;
  // Flat YouTube listings use a null title for private/deleted entries.
  if (entry.title === null || entry.title === undefined) return true;
  const availability =
    typeof entry.availability === "string"
      ? entry.availability.toLowerCase()
      : "";
  if (UNAVAILABLE_AVAILABILITY.has(availability)) return true;
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  return UNAVAILABLE_TITLE.test(title);
}

function buildVideo(
  entry: RawEntry,
  index: number,
  youtube: boolean,
  startIndex: number,
): PlaylistVideo | null {
  if (!entry || typeof entry !== "object") return null;
  if (isUnavailable(entry)) return null;
  const id = typeof entry.id === "string" ? entry.id : "";
  let url =
    typeof entry.url === "string" && /^https?:/i.test(entry.url)
      ? entry.url
      : typeof entry.webpage_url === "string" &&
          /^https?:/i.test(entry.webpage_url)
        ? entry.webpage_url
        : "";
  if (!url && youtube && id) {
    url = `https://www.youtube.com/watch?v=${id}`;
  }
  if (!url) return null;

  const thumbnail =
    rawThumbnail(entry) ||
    (youtube && id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "");

  const sourceIndex =
    typeof entry.playlist_index === "number" &&
    Number.isInteger(entry.playlist_index) &&
    entry.playlist_index > 0
      ? entry.playlist_index
      : startIndex + index;

  return {
    url,
    title: typeof entry.title === "string" ? entry.title : "",
    thumbnail,
    playlistIndex: sourceIndex,
  };
}

function runResolver(
  value: string,
  start = 1,
  end = PLAYLIST_ENTRY_LIMIT,
  rotate = true,
): Promise<PlaylistInfo | null> {
  return new Promise((resolve) => {
    const ytDlp = findYtDlp(getSettings().binDir);
    const proc = spawn(
      ytDlp,
      [
        "--flat-playlist",
        "--dump-single-json",
        "--no-warnings",
        "--playlist-start",
        String(start),
        "--playlist-end",
        String(end),
        "--",
        value,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: RESOLVE_TIMEOUT_MS },
    );

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    proc.once("error", (err) => {
      console.warn(`[playlist] yt-dlp error: ${err.message}`);
      resolve(null);
    });
    proc.once("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        console.warn(
          `[playlist] yt-dlp failed (${code})${stderr ? `: ${stderr.trim().split("\n").pop()}` : ""}`,
        );
        resolve(null);
        return;
      }
      let parsed: RawPlaylist;
      try {
        parsed = JSON.parse(stdout) as RawPlaylist;
      } catch {
        console.warn("[playlist] yt-dlp returned invalid JSON");
        resolve(null);
        return;
      }
      const rawEntries = Array.isArray(parsed.entries)
        ? (parsed.entries as RawEntry[])
        : [];
      const youtube = youtubeHost(new URL(value).hostname.toLowerCase());
      const all = rawEntries
        .map((entry, index) => buildVideo(entry, index, youtube, start))
        .filter((entry): entry is PlaylistVideo => entry !== null);
      if (all.length < rawEntries.length) {
        console.warn(
          `[playlist] skipped ${rawEntries.length - all.length} unavailable/invalid entries`,
        );
      }

      // Deduplicate while preserving playlist order.
      const seen = new Set<string>();
      let entries = all.filter((entry) => {
        if (seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      });

      // Starting playback from a watch URL should begin at that video.
      if (youtube && rotate) {
        try {
          const currentId = new URL(value).searchParams.get("v");
          if (currentId) {
            const index = entries.findIndex((entry) =>
              entry.url.includes(currentId),
            );
            if (index > 0) entries = entries.slice(index);
          }
        } catch {
          // Keep the playlist order.
        }
      }

      if (entries.length === 0) {
        resolve(null);
        return;
      }

      const maxIndex = entries.reduce(
        (max, entry) => Math.max(max, entry.playlistIndex),
        0,
      );
      const total =
        typeof parsed.playlist_count === "number" &&
        parsed.playlist_count >= maxIndex
          ? parsed.playlist_count
          : maxIndex || entries.length;
      resolve({
        id:
          typeof parsed.id === "string" && parsed.id
            ? parsed.id
            : createHash("sha1").update(value).digest("hex").slice(0, 12),
        title:
          typeof parsed.title === "string" && parsed.title
            ? parsed.title
            : "Playlist",
        entries,
        total,
        truncated: total > maxIndex,
      });
    });
  });
}

export async function fetchPlaylistInfo(
  value: string,
): Promise<PlaylistInfo | null> {
  const cached = cache.get(value);
  if (cached && cached.expires > Date.now()) return cached.info;

  const existing = inflight.get(value);
  if (existing) return existing;

  const promise = runResolver(value).then((info) => {
    inflight.delete(value);
    if (info) {
      cache.set(value, { expires: Date.now() + CACHE_TTL_MS, info });
    }
    return info;
  });
  inflight.set(value, promise);
  return promise;
}

/**
 * Resolves one page of a longer playlist for the queue's "Load more" action.
 * Pages are not cached: they are only requested when the user explicitly asks
 * for the next batch.
 */
export async function fetchPlaylistPage(
  value: string,
  start: number,
  end: number,
): Promise<PlaylistInfo | null> {
  const first = Math.max(1, Math.floor(start));
  const last = Math.max(first, Math.floor(end));
  return runResolver(value, first, last, false);
}
