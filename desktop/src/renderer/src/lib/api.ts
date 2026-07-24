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
  error?: string;
}

const api = window.electronAPI;

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
