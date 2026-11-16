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

interface ElectronAPI {
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
      }[]
    >;
    clear: () => Promise<void>;
    replay: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
  player: {
    check: (exe: string) => Promise<boolean>;
    status: () => Promise<{
      supported: boolean;
      alive: boolean;
      ipcReady: boolean;
      url: string | null;
      title: string;
      position: number;
      duration: number;
      paused: boolean;
      queue: { url: string; title: string }[];
      chapters: { title: string; time: number }[];
      chapter: number | null;
      volume: number;
      muted: boolean;
      speed: number;
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
  };
  downloads: {
    list: () => Promise<DownloadItem[]>;
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
