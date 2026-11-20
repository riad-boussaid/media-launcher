/// <reference types="vite/client" />

interface DownloadItem {
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

interface ToolInfo {
  id: string;
  path: string | null;
  source: "portable" | "system" | null;
  version: string | null;
  sizeBytes: number | null;
  verifiedAt: number | null;
  imported: boolean;
}

interface AppUpdateInfo {
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

interface WatchLaterEntry {
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

interface WatchLaterTransferResult {
  saved?: boolean;
  canceled?: boolean;
  count?: number;
  imported?: number;
  skipped?: number;
  error?: string;
}

interface ElectronAPI {
  platform: "win32" | "darwin" | "linux";
  server: {
    getToken: () => Promise<string | null>;
    status: () => Promise<{ online: boolean }>;
    probe: (url: string) => Promise<{ ok: boolean; detail?: string }>;
    remoteUrls: (fresh?: boolean) => Promise<{
      lan: string | null;
      tailscale: string | null;
      expiresAt: number | null;
    }>;
  };
  updates: {
    state: () => Promise<AppUpdateInfo | null>;
    check: () => Promise<AppUpdateInfo>;
  };
  remote: {
    sessions: () => Promise<
      {
        id: string;
        device: string;
        createdAt: number;
        lastSeen: number;
      }[]
    >;
    revokeSession: (id: string) => Promise<
      {
        id: string;
        device: string;
        createdAt: number;
        lastSeen: number;
      }[]
    >;
    revokeAll: () => Promise<void>;
  };
  settings: {
    get: () => Promise<{
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
    }>;
    set: (partial: Record<string, unknown>) => Promise<{
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
    }>;
  };
  history: {
    get: () => Promise<
      {
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
      }[]
    >;
    delete: (id: string) => Promise<
      {
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
      }[]
    >;
    clear: () => Promise<void>;
    replay: (url: string) => Promise<{ success: boolean; error?: string }>;
    queue: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
  watchLater: {
    get: () => Promise<WatchLaterEntry[]>;
    add: (
      url: string,
      title?: string,
      thumbnail?: string,
      addedAt?: number,
    ) => Promise<WatchLaterEntry>;
    delete: (id: string) => Promise<WatchLaterEntry[]>;
    clear: () => Promise<void>;
    play: (ids?: string[]) => Promise<{
      success: boolean;
      count?: number;
      total?: number;
      error?: string;
    }>;
    queue: (ids?: string[]) => Promise<{
      success: boolean;
      count?: number;
      total?: number;
      error?: string;
    }>;
    reorder: (ids: string[]) => Promise<WatchLaterEntry[]>;
    unwatch: (id: string) => Promise<WatchLaterEntry[]>;
    exportFile: () => Promise<WatchLaterTransferResult>;
    importFile: () => Promise<WatchLaterTransferResult>;
  };
  player: {
    check: (exe: string) => Promise<boolean>;
    status: () => Promise<{
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
      error: {
        url: string;
        title: string;
        playlistTitle: string | null;
        playlistIndex: number | null;
        message: string;
      } | null;
      position: number;
      duration: number;
      live: boolean;
      paused: boolean;
      queue: {
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
      }[];
      past: {
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
      }[];
      chapters: { title: string; time: number }[];
      chapter: number | null;
      volume: number;
      muted: boolean;
      speed: number;
      repeat: "off" | "one" | "all";
    }>;
    togglePause: () => Promise<boolean>;
    skip: () => Promise<boolean>;
    chapterPrev: () => Promise<boolean>;
    chapterNext: () => Promise<boolean>;
    seek: (position: number) => Promise<boolean>;
    volume: (value: number) => Promise<boolean>;
    mute: () => Promise<boolean>;
    speed: (value: number) => Promise<boolean>;
    stop: () => Promise<boolean>;
    queueRemove: (index: number) => Promise<boolean>;
    queueMove: (index: number, direction: "up" | "down") => Promise<boolean>;
    queueMoveTo: (index: number, target: number) => Promise<boolean>;
    queueShuffle: () => Promise<boolean>;
    setRepeat: (mode: "off" | "one" | "all") => Promise<boolean>;
    queuePlay: (index: number) => Promise<boolean>;
    queueClear: () => Promise<boolean>;
    loadMorePlaylist: (
      playlistUrl: string,
      playlistId: string,
    ) => Promise<boolean>;
    savedQueue: () => Promise<import("./lib/api").SavedQueue | null>;
    restoreSavedQueue: () => Promise<boolean>;
    discardSavedQueue: () => Promise<boolean>;
    queueRemovePlaylist: (playlistId: string) => Promise<boolean>;
    queueClearPlayed: (playlistId?: string) => Promise<boolean>;
    clearError: () => Promise<boolean>;
  };
  downloads: {
    list: () => Promise<DownloadItem[]>;
    recheck: () => Promise<DownloadItem[]>;
    info: () => Promise<ToolInfo[]>;
    import: () => Promise<string | null>;
    openFolder: () => Promise<void>;
    reveal: (path: string) => Promise<boolean>;
    cancel: (id: string) => Promise<boolean>;
    getAutoUpdate: () => Promise<boolean>;
    setAutoUpdate: (enabled: boolean) => Promise<boolean>;
    start: (id: string) => Promise<DownloadItem[]>;
    delete: (id: string) => Promise<DownloadItem[]>;
    updateCheck: (id: string) => Promise<{
      id: string;
      installedVersion: string | null;
      latestVersion: string | null;
      updateAvailable: boolean;
    }>;
  };
  shell: {
    open: (url: string) => Promise<void>;
  };
  dialog: {
    pickExecutable: () => Promise<string | null>;
  };
  window: {
    toggle: () => Promise<void>;
    openHistory: () => Promise<void>;
    setThemeOverlay: (mode: "dark" | "light") => void;
    onNavigate: (cb: (tab: string) => void) => () => void;
  };
}

// Global-script augmentation: this file is not a module, so the interface
// merges directly into Window (declare global is ignored under the web
// tsconfig's composite settings).
interface Window {
  electronAPI: ElectronAPI;
}
