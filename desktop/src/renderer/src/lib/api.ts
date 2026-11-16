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

export interface DownloadItem {
  id: string;
  name: string;
  description: string;
  size: string;
  platform: "win32" | "darwin" | "linux" | null;
  url?: string;
  canDownload: boolean;
  installed: boolean;
  systemAvailable: boolean;
  status: "idle" | "downloading" | "done" | "error";
  /** 0..1 when the content length is known, -1 for indeterminate, null otherwise. */
  progress: number | null;
  error?: string;
}

export interface ServerStatus {
  online: boolean;
}

export interface ProbeResult {
  ok: boolean;
  detail?: string;
}

export interface UpdateCheck {
  id: string;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}

const api = window.electronAPI;

export async function getServerStatus(): Promise<ServerStatus> {
  return api.server.status();
}

export interface RemoteUrls {
  /** Pairing link over the LAN (Wi-Fi/Ethernet). */
  lan: string | null;
  /** Pairing link over Tailscale (works from outside the LAN too). */
  tailscale: string | null;
}

export interface RemoteSessionInfo {
  id: string;
  device: string;
  createdAt: number;
  lastSeen: number;
}

export async function getRemoteUrls(): Promise<RemoteUrls> {
  return api.server.remoteUrls();
}

export async function getRemoteSessions(): Promise<RemoteSessionInfo[]> {
  return api.remote.sessions();
}

export async function revokeRemoteSession(
  id: string,
): Promise<RemoteSessionInfo[]> {
  return api.remote.revokeSession(id);
}

export async function revokeAllRemoteSessions(): Promise<void> {
  return api.remote.revokeAll();
}

export async function probeServerUrl(url: string): Promise<ProbeResult> {
  return api.server.probe(url);
}

export async function checkUpdate(id: string): Promise<UpdateCheck> {
  return api.downloads.updateCheck(id);
}

export async function getSettings(): Promise<Settings> {
  return api.settings.get();
}

export async function setSettings(
  partial: Partial<Settings>,
): Promise<Settings> {
  return api.settings.set(partial as Record<string, unknown>);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return api.history.get();
}

export async function deleteHistory(id: string): Promise<HistoryEntry[]> {
  return api.history.delete(id);
}

export async function clearHistory(): Promise<void> {
  return api.history.clear();
}

export async function replayUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  return api.history.replay(url);
}

export async function checkPlayer(exe: string): Promise<boolean> {
  return api.player.check(exe);
}

export async function getPlayerStatus(): Promise<PlayerStatus> {
  return api.player.status();
}

export async function togglePause(): Promise<boolean> {
  return api.player.togglePause();
}

export async function skipTrack(): Promise<boolean> {
  return api.player.skip();
}

export async function chapterPrev(): Promise<boolean> {
  return api.player.chapterPrev();
}

export async function chapterNext(): Promise<boolean> {
  return api.player.chapterNext();
}

export async function seekTo(position: number): Promise<boolean> {
  return api.player.seek(position);
}

export async function setVolume(volume: number): Promise<boolean> {
  return api.player.volume(volume);
}

export async function toggleMute(): Promise<boolean> {
  return api.player.mute();
}

export async function setSpeed(speed: number): Promise<boolean> {
  return api.player.speed(speed);
}

export async function stopPlayback(): Promise<boolean> {
  return api.player.stop();
}

export async function getDownloads(): Promise<DownloadItem[]> {
  return api.downloads.list();
}

export async function startDownload(id: string): Promise<DownloadItem[]> {
  return api.downloads.start(id);
}

export async function deleteDownload(id: string): Promise<DownloadItem[]> {
  return api.downloads.delete(id);
}

export async function openExternal(url: string): Promise<void> {
  return api.shell.open(url);
}

export async function pickExecutable(): Promise<string | null> {
  return api.dialog.pickExecutable();
}
