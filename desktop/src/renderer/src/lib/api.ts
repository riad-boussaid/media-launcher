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
  liveStatus?: string;
  isShort?: boolean;
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

export interface ToolInfo {
  id: string;
  path: string | null;
  source: "portable" | "system" | null;
  version: string | null;
  sizeBytes: number | null;
  verifiedAt: number | null;
  imported: boolean;
}

export interface ServerStatus {
  online: boolean;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  notes: string;
  publishedAt: string | null;
  checkedAt: number;
  error: string | null;
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

export function getPlatform(): "win32" | "darwin" | "linux" {
  return api.platform;
}

export async function getServerStatus(): Promise<ServerStatus> {
  return api.server.status();
}

export async function getAppUpdateState(): Promise<AppUpdateInfo | null> {
  return api.updates.state();
}

export async function checkAppUpdate(): Promise<AppUpdateInfo> {
  return api.updates.check();
}

export interface RemoteUrls {
  /** Pairing link over the LAN (Wi-Fi/Ethernet). */
  lan: string | null;
  /** Pairing link over Tailscale (works from outside the LAN too). */
  tailscale: string | null;
  /** When the displayed one-time codes expire. */
  expiresAt: number | null;
}

export interface RemoteSessionInfo {
  id: string;
  device: string;
  createdAt: number;
  lastSeen: number;
}

export async function getRemoteUrls(fresh = false): Promise<RemoteUrls> {
  return api.server.remoteUrls(fresh);
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

export async function getWatchLater(): Promise<WatchLaterEntry[]> {
  return api.watchLater.get();
}

export async function addWatchLater(
  url: string,
  title?: string,
  thumbnail?: string,
  addedAt?: number,
): Promise<WatchLaterEntry> {
  return api.watchLater.add(url, title, thumbnail, addedAt);
}

export async function reorderWatchLater(
  ids: string[],
): Promise<WatchLaterEntry[]> {
  return api.watchLater.reorder(ids);
}

export async function resetWatchLaterProgress(
  id: string,
): Promise<WatchLaterEntry[]> {
  return api.watchLater.unwatch(id);
}

export async function refreshWatchLater(
  id: string,
): Promise<WatchLaterEntry[]> {
  return api.watchLater.refresh(id);
}

export interface WatchLaterTransferResult {
  saved?: boolean;
  canceled?: boolean;
  count?: number;
  imported?: number;
  skipped?: number;
  error?: string;
}

export async function exportWatchLater(): Promise<WatchLaterTransferResult> {
  return api.watchLater.exportFile();
}

export async function importWatchLater(): Promise<WatchLaterTransferResult> {
  return api.watchLater.importFile();
}

export async function deleteWatchLater(id: string): Promise<WatchLaterEntry[]> {
  return api.watchLater.delete(id);
}

export async function clearWatchLater(): Promise<void> {
  return api.watchLater.clear();
}

export interface WatchLaterActionResult {
  success: boolean;
  count?: number;
  total?: number;
  error?: string;
}

export async function playWatchLater(
  ids?: string[],
): Promise<WatchLaterActionResult> {
  return api.watchLater.play(ids);
}

export async function queueWatchLater(
  ids?: string[],
): Promise<WatchLaterActionResult> {
  return api.watchLater.queue(ids);
}

export async function replayUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  return api.history.replay(url);
}

export async function queueUrl(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  return api.history.queue(url);
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

export async function removeQueueItem(index: number): Promise<boolean> {
  return api.player.queueRemove(index);
}

export async function moveQueueItem(
  index: number,
  direction: "up" | "down",
): Promise<boolean> {
  return api.player.queueMove(index, direction);
}

export async function moveQueueItemTo(
  index: number,
  target: number,
): Promise<boolean> {
  return api.player.queueMoveTo(index, target);
}

export async function shuffleQueue(): Promise<boolean> {
  return api.player.queueShuffle();
}

export async function setRepeatMode(
  mode: "off" | "one" | "all",
): Promise<boolean> {
  return api.player.setRepeat(mode);
}

export async function playQueueItem(index: number): Promise<boolean> {
  return api.player.queuePlay(index);
}

export async function loadMorePlaylist(
  playlistUrl: string,
  playlistId: string,
): Promise<boolean> {
  return api.player.loadMorePlaylist(playlistUrl, playlistId);
}

export async function getSavedQueue(): Promise<SavedQueue | null> {
  return api.player.savedQueue();
}

export async function restoreSavedQueue(): Promise<boolean> {
  return api.player.restoreSavedQueue();
}

export async function discardSavedQueue(): Promise<boolean> {
  return api.player.discardSavedQueue();
}

export async function clearQueue(): Promise<boolean> {
  return api.player.queueClear();
}

export async function removePlaylistFromQueue(
  playlistId: string,
): Promise<boolean> {
  return api.player.queueRemovePlaylist(playlistId);
}

export async function clearPlayedPlaylist(
  playlistId?: string,
): Promise<boolean> {
  return api.player.queueClearPlayed(playlistId);
}

export async function clearPlaybackError(): Promise<boolean> {
  return api.player.clearError();
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

export async function recheckDownloads(): Promise<DownloadItem[]> {
  return api.downloads.recheck();
}

export async function getToolInfo(): Promise<ToolInfo[]> {
  return api.downloads.info();
}

export async function importTool(): Promise<string | null> {
  return api.downloads.import();
}

export async function openToolsFolder(): Promise<void> {
  return api.downloads.openFolder();
}

export async function revealTool(path: string): Promise<boolean> {
  return api.downloads.reveal(path);
}

export async function cancelDownload(id: string): Promise<boolean> {
  return api.downloads.cancel(id);
}

export async function getAutoUpdateYtDlp(): Promise<boolean> {
  return api.downloads.getAutoUpdate();
}

export async function setAutoUpdateYtDlp(enabled: boolean): Promise<boolean> {
  return api.downloads.setAutoUpdate(enabled);
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
