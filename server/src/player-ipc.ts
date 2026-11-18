import type { ChildProcess } from "node:child_process";
import { randomInt } from "node:crypto";
import { connect, type Socket } from "node:net";
import {
  addHistory,
  getHistoryMetadata,
  getHistoryPosition,
  getSettings,
  updateHistoryPositionByUrl,
} from "./db.js";
import {
  clearSavedQueue,
  type SavedQueueEntry,
  writeSavedQueue,
} from "./saved-queue.js";

// Talks to mpv over its JSON IPC socket (--input-ipc-server): observes
// playback properties, exposes now-playing state and controls, and persists
// the playback position into history for resume. The socket is created per
// mpv launch and dies with the process, so everything here is session-local.

export interface QueueEntry {
  /** Absolute mpv playlist index, used for queue operations. */
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

export interface QueueSourceInfo {
  url: string;
  source: "queue" | "playlist";
  title?: string;
  thumbnail?: string;
  playlistId?: string;
  playlistTitle?: string;
  playlistUrl?: string;
  playlistTotal?: number;
  playlistTruncated?: boolean;
  playlistIndex?: number;
}

export interface PlaybackError {
  url: string;
  title: string;
  playlistTitle: string | null;
  playlistIndex: number | null;
  message: string;
}

export interface ChapterEntry {
  title: string;
  time: number;
}

export interface PlayerStatus {
  /** True when the configured player is mpv (the only one with IPC support). */
  supported: boolean;
  /** The mpv process is running. */
  alive: boolean;
  /** The IPC socket is connected — controls work. */
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
  paused: boolean;
  queue: QueueEntry[];
  /** Playlist-sourced entries before the current one, for playlist context. */
  past: QueueEntry[];
  /** Embedded chapters (empty when the media has none). */
  chapters: ChapterEntry[];
  /** Index of the current chapter, or null when the media has none. */
  chapter: number | null;
  /** Player volume, 0-100 (mpv's default range). */
  volume: number;
  muted: boolean;
  /** Playback speed multiplier. */
  speed: number;
  /** Repeat mode applied to the mpv playlist. */
  repeat: "off" | "one" | "all";
}

interface PlaylistEntry {
  filename: string;
  title?: string;
  current?: boolean;
}

interface NowPlaying {
  url: string;
  title: string;
  position: number;
  duration: number;
  paused: boolean;
  chapters: ChapterEntry[];
  chapter: number;
  volume: number;
  muted: boolean;
  speed: number;
  loopFile: boolean;
  loopPlaylist: boolean;
}

const OBSERVED = [
  "time-pos",
  "duration",
  "pause",
  "media-title",
  "playlist",
  "chapter-list",
  "chapter",
  "volume",
  "mute",
  "speed",
  "loop-file",
  "loop-playlist",
];

let proc: ChildProcess | null = null;
let socket: Socket | null = null;
let ipcReady = false;
let playlist: PlaylistEntry[] = [];
let current: NowPlaying | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let buffer = "";
let requestId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void }>();

// Playlist provenance is server-side: mpv playlist entries only carry a URL.
// Remember where each queued URL came from so the queue can be grouped and
// playlist tracks can enter history as they start.
const queueSources = new Map<string, QueueSourceInfo>();
let playbackError: PlaybackError | null = null;
let resumeChecked: string | null = null;
let savedQueueSig = "";
let queueFinished = false;
let stopping = false;

export function clearPlaybackError(): void {
  playbackError = null;
}

export function rememberQueueSources(entries: QueueSourceInfo[]): void {
  for (const entry of entries) {
    if (entry.url) queueSources.set(entry.url, entry);
  }
}

function handleLine(line: string): void {
  if (!line.trim()) return;
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }

  if (typeof msg.request_id === "number") {
    const waiter = pending.get(msg.request_id);
    if (waiter) {
      pending.delete(msg.request_id);
      waiter.resolve(msg.error === "success" ? msg.data : null);
    }
    return;
  }

  if (msg.event === "property-change" && current) {
    const data = msg.data;
    switch (msg.name) {
      case "time-pos":
        current.position = typeof data === "number" ? data : 0;
        break;
      case "duration":
        current.duration = typeof data === "number" ? data : 0;
        break;
      case "pause":
        current.paused = data === true;
        break;
      case "media-title":
        if (typeof data === "string" && data) current.title = data;
        break;
      case "chapter-list":
        if (Array.isArray(data)) {
          current.chapters = (data as { title?: string; time: number }[]).map(
            (c) => ({ title: c.title ?? "", time: c.time }),
          );
        }
        break;
      case "chapter":
        current.chapter = typeof data === "number" ? data : -1;
        break;
      case "volume":
        current.volume = typeof data === "number" ? data : 0;
        break;
      case "mute":
        current.muted = data === true;
        break;
      case "speed":
        current.speed = typeof data === "number" && data > 0 ? data : 1;
        break;
      case "loop-file":
        current.loopFile =
          data === "inf" ||
          data === true ||
          (typeof data === "number" && data > 0);
        break;
      case "loop-playlist":
        current.loopPlaylist =
          data === "inf" ||
          data === true ||
          (typeof data === "number" && data > 0);
        break;
      case "playlist":
        if (Array.isArray(data)) {
          playlist = data as PlaylistEntry[];
          const cur = playlist.find((e) => e.current === true);
          // Advancing to the next queued track resets playback state.
          if (cur && cur.filename !== current.url) {
            const source = queueSources.get(cur.filename);
            resumeChecked = null;
            if (source) {
              // Queued playlist entries were not written to history when the
              // playlist was queued; record them as they actually start.
              addHistory(
                cur.filename,
                source.title ?? "",
                source.thumbnail ?? "",
              );
            }
            current = {
              url: cur.filename,
              title: source?.title ?? "",
              position: 0,
              duration: 0,
              paused: false,
              chapters: [],
              chapter: -1,
              // Player-level state survives the track change.
              volume: current.volume,
              muted: current.muted,
              speed: current.speed,
              loopFile: current.loopFile,
              loopPlaylist: current.loopPlaylist,
            };
          }
        }
        break;
    }
    return;
  }

  if (msg.event === "file-loaded") {
    void resumeTrackIfNeeded();
    return;
  }

  if (msg.event === "end-file" && current) {
    if (msg.reason === "eof") {
      // Watched to the end — a replay should start over.
      updateHistoryPositionByUrl(current.url, 0);
      const index = playlist.findIndex((entry) => entry.current === true);
      if (index >= 0 && index === playlist.length - 1) {
        // Nothing follows the finished track, so there is no queue to restore.
        queueFinished = true;
        savedQueueSig = "";
        clearSavedQueue();
      }
    } else if (msg.reason === "error") {
      const source = queueSources.get(current.url);
      // For playlist entries mpv's fallback title is the raw watch URL, which
      // is worse than the "Track N of <playlist>" label the UI can build from
      // the provenance below.
      const errorTitle =
        source?.title ||
        (source?.source === "playlist" ? "" : current.title) ||
        "";
      playbackError = {
        url: current.url,
        title: errorTitle,
        playlistTitle: source?.playlistTitle ?? null,
        playlistIndex: source?.playlistIndex ?? null,
        message: "This video could not be played.",
      };
      flushPosition();
    } else {
      flushPosition();
    }
  }
}

/**
 * Resumes a partially watched queued or playlist track. mpv's --start applies
 * to every file in the playlist, so per-track resume has to happen when each
 * file actually loads instead of on the command line.
 */
async function resumeTrackIfNeeded(): Promise<void> {
  if (!ipcReady || !current) return;
  const url = current.url;
  if (resumeChecked === url) return;
  if (!getSettings().resumePlayback) return;
  const position = getHistoryPosition(url);
  if (position <= 60) {
    resumeChecked = url;
    return;
  }
  // A launch with --start already positioned the file.
  if (current.position > 5) return;
  resumeChecked = url;
  const res = await request(["seek", String(position), "absolute"]);
  if (res.sent && current?.url === url) current.position = position;
}

/** Persists the current position, unless the video is effectively finished. */
function flushPosition(): void {
  if (!current?.url || current.position <= 0) return;
  let position = current.position;
  if (current.duration > 0 && position / current.duration >= 0.95) {
    position = 0;
  }
  if (position > 0) {
    updateHistoryPositionByUrl(current.url, Math.floor(position));
  }
}

/**
 * Sends a command. `sent` is false only when there is no connected socket.
 * A sent command whose response was lost (e.g. the socket churns during a
 * track transition) still executed — observed properties re-sync the state.
 */
function request(
  command: unknown[],
  timeoutMs = 3000,
): Promise<{ sent: boolean; data: unknown }> {
  return new Promise((resolve) => {
    if (!socket || !ipcReady) return resolve({ sent: false, data: null });
    requestId += 1;
    const id = requestId;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ sent: true, data: null });
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve({ sent: true, data: value });
      },
    });
    socket.write(`${JSON.stringify({ command, request_id: id })}\n`);
  });
}

function observeAll(): void {
  OBSERVED.forEach((name, index) => {
    void request(["observe_property", index + 1, name], 1000);
  });
}

function connectPipe(pipePath: string): void {
  let attempts = 20; // mpv creates the socket shortly after spawning
  const tryConnect = () => {
    if (!proc || proc.exitCode !== null) return;
    const s = connect({ path: pipePath });
    s.setEncoding("utf8");
    s.once("connect", () => {
      socket = s;
      ipcReady = true;
      buffer = "";
      observeAll();
    });
    s.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        handleLine(line);
        index = buffer.indexOf("\n");
      }
    });
    s.once("error", () => {
      s.destroy();
    });
    s.once("close", () => {
      ipcReady = false;
      if (socket === s) socket = null;
      // mpv recreates nothing — but while it lives the pipe should exist, so
      // retry briefly (covers a slow first connect too).
      if (proc && proc.exitCode === null && attempts > 0) {
        attempts -= 1;
        setTimeout(tryConnect, 1000);
      }
    });
  };
  tryConnect();
}

/** Tracks a freshly spawned mpv instance and starts observing it. */
export function registerPlayer(
  child: ChildProcess,
  pipePath: string,
  url: string,
): void {
  queueSources.clear();
  playbackError = null;
  resumeChecked = null;
  savedQueueSig = "";
  queueFinished = false;
  stopping = false;
  clearSavedQueue();
  proc = child;
  current = {
    url,
    title: "",
    position: 0,
    duration: 0,
    paused: false,
    chapters: [],
    chapter: -1,
    volume: 0,
    muted: false,
    speed: 1,
    loopFile: false,
    loopPlaylist: false,
  };
  connectPipe(pipePath);
  flushTimer = setInterval(() => flushPosition(), 10000);
  child.once("exit", () => {
    flushPosition();
    if (stopping) {
      savedQueueSig = "";
      clearSavedQueue();
      stopping = false;
    }
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    if (socket) socket.destroy();
    socket = null;
    ipcReady = false;
    playlist = [];
    current = null;
    queueSources.clear();
    proc = null;
  });
}

function savedEntry(entry: PlaylistEntry): SavedQueueEntry {
  const source = queueSources.get(entry.filename);
  return {
    url: entry.filename,
    title: source?.title || entry.title || "",
    thumbnail: source?.thumbnail || "",
    source: source?.source ?? "queue",
    playlistId: source?.playlistId ?? null,
    playlistTitle: source?.playlistTitle ?? null,
    playlistUrl: source?.playlistUrl ?? null,
    playlistTotal: source?.playlistTotal ?? null,
    playlistTruncated: source?.playlistTruncated ?? false,
    playlistIndex: source?.playlistIndex ?? null,
  };
}

/**
 * Snapshots the current track and everything after it. getPlayerStatus calls
 * this on every poll, but the signature check keeps writes to actual queue
 * changes.
 */
function persistQueueSnapshot(): void {
  if (queueFinished || stopping) return;
  if (!current || !proc || proc.exitCode !== null) return;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  const upcoming = currentIndex >= 0 ? playlist.slice(currentIndex + 1) : [];
  const source = queueSources.get(current.url);
  const currentEntry: SavedQueueEntry = {
    url: current.url,
    title: source?.title || current.title || "",
    thumbnail: source?.thumbnail || "",
    source: source?.source ?? "queue",
    playlistId: source?.playlistId ?? null,
    playlistTitle: source?.playlistTitle ?? null,
    playlistUrl: source?.playlistUrl ?? null,
    playlistTotal: source?.playlistTotal ?? null,
    playlistTruncated: source?.playlistTruncated ?? false,
    playlistIndex: source?.playlistIndex ?? null,
  };
  const entries = upcoming.map(savedEntry);
  const sig = [
    currentEntry.url,
    currentEntry.title,
    ...entries.map((entry) => `${entry.url}|${entry.title}`),
  ].join("\n");
  if (sig === savedQueueSig) return;
  savedQueueSig = sig;
  writeSavedQueue({ savedAt: Date.now(), current: currentEntry, entries });
}

export function getPlayerStatus(): PlayerStatus {
  const alive =
    proc !== null && proc.exitCode === null && proc.signalCode === null;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  const pastEntries = currentIndex > 0 ? playlist.slice(0, currentIndex) : [];
  const upcoming = currentIndex >= 0 ? playlist.slice(currentIndex + 1) : [];
  const lookupUrls = [...pastEntries, ...upcoming].map(
    (entry) => entry.filename,
  );
  if (current?.url) lookupUrls.push(current.url);
  const metadata = getHistoryMetadata(lookupUrls);
  const toQueueEntry = (entry: PlaylistEntry, index: number): QueueEntry => {
    const source = queueSources.get(entry.filename);
    const history = metadata.get(entry.filename);
    return {
      index,
      url: entry.filename,
      title: source?.title || entry.title || history?.title || "",
      thumbnail: source?.thumbnail || history?.thumbnail || "",
      source: source?.source ?? "queue",
      playlistId: source?.playlistId ?? null,
      playlistTitle: source?.playlistTitle ?? null,
      playlistUrl: source?.playlistUrl ?? null,
      playlistTotal: source?.playlistTotal ?? null,
      playlistTruncated: source?.playlistTruncated ?? false,
      playlistIndex: source?.playlistIndex ?? null,
    };
  };
  const queue = upcoming.map((entry, offset) =>
    toQueueEntry(entry, currentIndex + 1 + offset),
  );
  const past = pastEntries.flatMap((entry, index) => {
    const source = queueSources.get(entry.filename);
    return source?.source === "playlist" ? [toQueueEntry(entry, index)] : [];
  });
  const currentSource = current ? queueSources.get(current.url) : undefined;
  const currentHistory = current ? metadata.get(current.url) : undefined;
  persistQueueSnapshot();
  return {
    supported: getSettings().player === "mpv",
    alive,
    ipcReady,
    url: current?.url ?? null,
    title:
      currentSource?.title || current?.title || currentHistory?.title || "",
    thumbnail: currentSource?.thumbnail || currentHistory?.thumbnail || "",
    source: currentSource?.source ?? null,
    playlistId: currentSource?.playlistId ?? null,
    playlistTitle: currentSource?.playlistTitle ?? null,
    playlistUrl: currentSource?.playlistUrl ?? null,
    playlistTotal: currentSource?.playlistTotal ?? null,
    playlistTruncated: currentSource?.playlistTruncated ?? false,
    playlistIndex: currentSource?.playlistIndex ?? null,
    error: playbackError,
    position: current?.position ?? 0,
    duration: current?.duration ?? 0,
    paused: current?.paused ?? false,
    queue,
    past,
    chapters: current?.chapters ?? [],
    chapter: current && current.chapter >= 0 ? current.chapter : null,
    volume: Math.round(current?.volume ?? 0),
    muted: current?.muted ?? false,
    speed: current?.speed ?? 1,
    repeat: current?.loopFile ? "one" : current?.loopPlaylist ? "all" : "off",
  };
}

/** Seeks to an absolute position in seconds (clamped to the media length). */
export async function seekTo(position: number): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const target = Math.max(0, Math.floor(position));
  const res = await request(["seek", target, "absolute"]);
  if (res.sent) current.position = target;
  return res.sent;
}

export async function setVolume(volume: number): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const v = Math.min(100, Math.max(0, Math.round(volume)));
  const res = await request(["set_property", "volume", v]);
  if (res.sent) current.volume = v;
  return res.sent;
}

export async function toggleMute(): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const next = !current.muted;
  const res = await request(["set_property", "mute", next]);
  if (res.sent) current.muted = next;
  return res.sent;
}

export async function setSpeed(speed: number): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const s = Math.min(4, Math.max(0.25, Math.round(speed * 100) / 100));
  const res = await request(["set_property", "speed", s]);
  if (res.sent) current.speed = s;
  return res.sent;
}

/** Ends playback: mpv quits and the feedback loop resets. */
export async function stopPlayback(): Promise<boolean> {
  if (!ipcReady) return false;
  flushPosition();
  stopping = true;
  const res = await request(["quit"]);
  if (res.sent) {
    savedQueueSig = "";
    clearSavedQueue();
  } else {
    stopping = false;
  }
  return res.sent;
}

/** Replaces the currently playing video. */
export async function playNow(url: string): Promise<boolean> {
  if (!ipcReady || !current) return false;
  flushPosition();
  resumeChecked = null;
  current = {
    url,
    title: "",
    position: 0,
    duration: 0,
    paused: false,
    chapters: [],
    chapter: -1,
    // Player-level state (volume/mute/speed) persists across track changes.
    volume: current.volume,
    muted: current.muted,
    speed: current.speed,
    loopFile: current.loopFile,
    loopPlaylist: current.loopPlaylist,
  };
  const res = await request(["loadfile", url, "replace"]);
  return res.sent;
}

/** Appends to mpv's playlist, playing it when the current file ends. */
export async function queueUrl(url: string): Promise<boolean> {
  if (!ipcReady) return false;
  // Plain append, so queueing never replaces the current file.
  const res = await request(["loadfile", url, "append"]);
  return res.sent;
}

export async function togglePause(): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const next = !current.paused;
  const res = await request(["set_property", "pause", next]);
  if (res.sent) current.paused = next;
  return res.sent;
}

export async function skipTrack(): Promise<boolean> {
  if (!ipcReady) return false;
  const res = await request(["playlist-next", "force"]);
  return res.sent;
}

// Indexes for queue operations are absolute mpv playlist indexes. They always
// refer to entries after the currently playing one; the current entry and
// already-played entries cannot be manipulated through the queue API.
function isUpcomingIndex(index: number): boolean {
  if (!ipcReady) return false;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  return currentIndex >= 0 && index > currentIndex && index < playlist.length;
}

export async function removeQueueItem(index: number): Promise<boolean> {
  if (!isUpcomingIndex(index)) return false;
  const res = await request(["playlist-remove", String(index)]);
  return res.sent;
}

export async function moveQueueItem(
  index: number,
  direction: "up" | "down",
): Promise<boolean> {
  if (!isUpcomingIndex(index)) return false;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  if (direction === "up") {
    if (index <= currentIndex + 1) return false;
    // Moving towards the current entry: target the entry just above it.
    const res = await request([
      "playlist-move",
      String(index),
      String(index - 1),
    ]);
    return res.sent;
  }
  if (index >= playlist.length - 1) return false;
  // Moving away from the current entry: index2 refers to the target entry
  // before the move, so skip one extra slot.
  const res = await request([
    "playlist-move",
    String(index),
    String(index + 2),
  ]);
  return res.sent;
}

export async function playQueueItem(index: number): Promise<boolean> {
  // Upcoming queue entries and already-played playlist entries are both
  // playable; only the current entry is excluded.
  if (!ipcReady) return false;
  if (!Number.isInteger(index) || index < 0 || index >= playlist.length) {
    return false;
  }
  if (playlist[index]?.current === true) return false;
  const res = await request(["playlist-play-index", String(index)]);
  return res.sent;
}

/** Removes every entry after the current one. */
export async function clearQueue(): Promise<boolean> {
  if (!ipcReady) return false;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  if (currentIndex < 0) return false;
  let changed = false;
  for (let index = playlist.length - 1; index > currentIndex; index--) {
    const res = await request(["playlist-remove", String(index)]);
    if (res.sent) changed = true;
  }
  return changed;
}

/**
 * Inserts new upcoming entries at a position relative to the current track
 * (0 = before the next entry, upcomingCount = append). Used by Load more so a
 * new playlist page lands next to its group without clearing the queue.
 */
export async function insertUpcoming(
  urls: string[],
  relativeIndex: number,
): Promise<boolean> {
  if (!ipcReady || urls.length === 0) return false;
  const currentIndex = playlist.findIndex((entry) => entry.current === true);
  if (currentIndex < 0) return false;
  const upcomingCount = playlist.length - currentIndex - 1;
  const relative = Math.max(
    0,
    Math.min(Math.floor(relativeIndex), upcomingCount),
  );
  const absolute = currentIndex + 1 + relative;
  const atEnd = absolute >= playlist.length;
  let index = absolute;
  for (const url of urls) {
    const command = atEnd
      ? ["loadfile", url, "append"]
      : ["loadfile", url, "insert-at", String(index)];
    const res = await request(command);
    if (!res.sent) return false;
    index += 1;
  }
  return true;
}

export async function shuffleQueue(): Promise<boolean> {
  if (!ipcReady) return false;
  const currentIndex = playlist.findIndex((entry) => entry.current === true);
  if (currentIndex < 0) return false;
  const count = playlist.length - currentIndex - 1;
  if (count < 2) return false;

  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Reorder in place with playlist-move instead of clearing and re-appending,
  // so the current track keeps playing even if it ends during the shuffle.
  const working = Array.from({ length: count }, (_, index) => index);
  for (let position = 0; position < order.length; position++) {
    const wanted = order[position];
    const from = working.indexOf(wanted);
    if (from === position) continue;
    const moved = await moveQueueItemTo(
      currentIndex + 1 + from,
      currentIndex + 1 + position,
    );
    if (!moved) return false;
    working.splice(from, 1);
    working.splice(position, 0, wanted);
  }
  return true;
}

export async function moveQueueItemTo(
  index: number,
  target: number,
): Promise<boolean> {
  if (!isUpcomingIndex(index) || !isUpcomingIndex(target)) return false;
  if (index === target) return true;
  if (index < target) {
    // mpv inserts before the target, so moving down needs target + 1 to land
    // at the requested position. The last entry has no index after it, so
    // swap it down one extra step instead.
    const last = playlist.length - 1;
    if (target === last) {
      const inserted = await request([
        "playlist-move",
        String(index),
        String(target),
      ]);
      if (!inserted.sent) return false;
      const swapped = await request([
        "playlist-move",
        String(target),
        String(target - 1),
      ]);
      return swapped.sent;
    }
    const res = await request([
      "playlist-move",
      String(index),
      String(target + 1),
    ]);
    return res.sent;
  }
  const res = await request(["playlist-move", String(index), String(target)]);
  return res.sent;
}

export async function setRepeatMode(
  mode: "off" | "one" | "all",
): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const loopFile = mode === "one" ? "inf" : "no";
  const loopPlaylist = mode === "all" ? "inf" : "no";
  const file = await request(["set_property", "loop-file", loopFile]);
  const list = await request(["set_property", "loop-playlist", loopPlaylist]);
  if (file.sent) current.loopFile = loopFile === "inf";
  if (list.sent) current.loopPlaylist = loopPlaylist === "inf";
  return file.sent && list.sent;
}

/** Removes every upcoming entry that came from the given playlist. */
export async function removePlaylistFromQueue(
  playlistId: string,
): Promise<boolean> {
  if (!ipcReady) return false;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  if (currentIndex < 0) return false;
  let changed = false;
  for (let index = playlist.length - 1; index > currentIndex; index--) {
    const source = queueSources.get(playlist[index].filename);
    if (source?.playlistId !== playlistId) continue;
    const res = await request(["playlist-remove", String(index)]);
    if (res.sent) changed = true;
  }
  return changed;
}

/**
 * Removes played playlist entries from mpv's playlist (they remain in
 * history). Removing from the end keeps earlier indexes stable.
 */
export async function clearPlayedPlaylist(
  playlistId?: string,
): Promise<boolean> {
  if (!ipcReady) return false;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  if (currentIndex <= 0) return false;
  let changed = false;
  for (let index = currentIndex - 1; index >= 0; index--) {
    const source = queueSources.get(playlist[index].filename);
    if (source?.source !== "playlist") continue;
    if (playlistId && source.playlistId !== playlistId) continue;
    const res = await request(["playlist-remove", String(index)]);
    if (res.sent) changed = true;
  }
  return changed;
}

export async function chapterPrev(): Promise<boolean> {
  if (!ipcReady || !current || current.chapter < 0) return false;
  // Walk to the previous chapter (no restart-the-current-chapter nicety —
  // a couple of seconds into a chapter that jump looks like a no-op).
  const target = Math.max(0, current.chapter - 1);
  const res = await request(["set_property", "chapter", target]);
  if (res.sent) current.chapter = target;
  return res.sent;
}

export async function chapterNext(): Promise<boolean> {
  if (!ipcReady || !current) return false;
  const last = current.chapters.length - 1;
  if (current.chapter < 0 || current.chapter >= last) return false;
  const target = current.chapter + 1;
  const res = await request(["set_property", "chapter", target]);
  if (res.sent) current.chapter = target;
  return res.sent;
}

// Best-effort position flush when the server is asked to terminate (unix).
// On Windows the desktop kills the process tree hard, so the 10 s interval
// flush is what keeps positions fresh there.
process.once("SIGTERM", () => {
  flushPosition();
  persistQueueSnapshot();
  process.exit(0);
});
