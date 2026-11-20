export interface Settings {
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

export type SettingsUpdate = Partial<Settings>;

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  timestamp: number;
  position: number;
  duration: number;
  completed: boolean;
  /** "live", "upcoming", "post_live", "was_live", "none", or "" if unknown. */
  liveStatus: string;
  isShort: boolean;
}

export interface WatchLaterEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  addedAt: number;
  /** "live", "upcoming", "post_live", "was_live", "none", or "" if unknown. */
  liveStatus: string;
  isShort: boolean;
  /** Playback progress from history, when the URL has been played. */
  position?: number;
  duration?: number;
  completed?: boolean;
  lastPlayedAt?: number;
}

export interface RemoteSession {
  id: string;
  device: string;
  createdAt: number;
  lastSeen: number;
}
