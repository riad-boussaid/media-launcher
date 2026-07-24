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
  error?: string;
}

interface ElectronAPI {
  settings: {
    get: () => Promise<{
      port: number;
      player: string;
      mpvArgs: string;
      playerArgs: Record<string, string>;
      customPlayerPath: string;
      customPlayerArgs: string;
      autoStart: boolean;
      startMinimized: boolean;
    }>;
    set: (partial: Record<string, unknown>) => Promise<{
      port: number;
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
      { id: string; url: string; title: string; thumbnail: string; timestamp: number }[]
    >;
    delete: (id: string) => Promise<
      { id: string; url: string; title: string; thumbnail: string; timestamp: number }[]
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
  };
  shell: {
    open: (url: string) => Promise<void>;
  };
  window: {
    toggle: () => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
