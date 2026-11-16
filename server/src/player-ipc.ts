import type { ChildProcess } from "node:child_process";
import { connect, type Socket } from "node:net";
import { getSettings, updateHistoryPositionByUrl } from "./db.js";

// Talks to mpv over its JSON IPC socket (--input-ipc-server): observes
// playback properties, exposes now-playing state and controls, and persists
// the playback position into history for resume. The socket is created per
// mpv launch and dies with the process, so everything here is session-local.

export interface QueueEntry {
  url: string;
  title: string;
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
  position: number;
  duration: number;
  paused: boolean;
  queue: QueueEntry[];
  /** Embedded chapters (empty when the media has none). */
  chapters: ChapterEntry[];
  /** Index of the current chapter, or null when the media has none. */
  chapter: number | null;
  /** Player volume, 0-100 (mpv's default range). */
  volume: number;
  muted: boolean;
  /** Playback speed multiplier. */
  speed: number;
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
      case "playlist":
        if (Array.isArray(data)) {
          playlist = data as PlaylistEntry[];
          const cur = playlist.find((e) => e.current === true);
          // Advancing to the next queued track resets playback state.
          if (cur && cur.filename !== current.url) {
            current = {
              url: cur.filename,
              title: "",
              position: 0,
              duration: 0,
              paused: false,
              chapters: [],
              chapter: -1,
              // Player-level state survives the track change.
              volume: current.volume,
              muted: current.muted,
              speed: current.speed,
            };
          }
        }
        break;
    }
    return;
  }

  if (msg.event === "end-file" && current) {
    if (msg.reason === "eof") {
      // Watched to the end — a replay should start over.
      updateHistoryPositionByUrl(current.url, 0);
    } else {
      flushPosition();
    }
  }
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
  };
  connectPipe(pipePath);
  flushTimer = setInterval(() => flushPosition(), 10000);
  child.once("exit", () => {
    flushPosition();
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    if (socket) socket.destroy();
    socket = null;
    ipcReady = false;
    playlist = [];
    current = null;
    proc = null;
  });
}

export function getPlayerStatus(): PlayerStatus {
  const alive =
    proc !== null && proc.exitCode === null && proc.signalCode === null;
  const currentIndex = playlist.findIndex((e) => e.current === true);
  const queue =
    currentIndex >= 0
      ? playlist
          .slice(currentIndex + 1)
          .map((e) => ({ url: e.filename, title: e.title ?? "" }))
      : [];
  return {
    supported: getSettings().player === "mpv",
    alive,
    ipcReady,
    url: current?.url ?? null,
    title: current?.title ?? "",
    position: current?.position ?? 0,
    duration: current?.duration ?? 0,
    paused: current?.paused ?? false,
    queue,
    chapters: current?.chapters ?? [],
    chapter: current && current.chapter >= 0 ? current.chapter : null,
    volume: Math.round(current?.volume ?? 0),
    muted: current?.muted ?? false,
    speed: current?.speed ?? 1,
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
  const res = await request(["quit"]);
  return res.sent;
}

/** Replaces the currently playing video. */
export async function playNow(url: string): Promise<boolean> {
  if (!ipcReady || !current) return false;
  flushPosition();
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
  };
  const res = await request(["loadfile", url, "replace"]);
  return res.sent;
}

/** Appends to mpv's playlist, playing it when the current file ends. */
export async function queueUrl(url: string): Promise<boolean> {
  if (!ipcReady) return false;
  const res = await request(["loadfile", url, "append-play"]);
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
  process.exit(0);
});
