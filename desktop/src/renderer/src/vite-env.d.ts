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
  };
  settings: {
    get: () => Promise<{
      serverUrl: string;
      player: string;
      mpvArgs: string;
      playerArgs: Record<string, string>;
      customPlayerPath: string;
      customPlayerArgs: string;
      autoStart: boolean;
      startMinimized: boolean;
    }>;
    set: (partial: Record<string, unknown>) => Promise<{
      serverUrl: string;
      player: string;
      mpvArgs: string;
      playerArgs: Record<string, string>;
      customPlayerPath: string;
      customPlayerArgs: string;
      autoStart: boolean;
      startMinimized: boolean;
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
      }[]
    >;
    delete: (id: string) => Promise<
      {
        id: string;
        url: string;
        title: string;
        thumbnail: string;
        timestamp: number;
      }[]
    >;
    clear: () => Promise<void>;
    replay: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
  player: {
    check: (exe: string) => Promise<boolean>;
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
    onNavigate: (cb: (tab: string) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
