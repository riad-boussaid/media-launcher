import { contextBridge, ipcRenderer } from "electron";

const api = {
  server: {
    getToken: () => ipcRenderer.invoke("server:token"),
    status: () => ipcRenderer.invoke("server:status"),
    probe: (url: string) => ipcRenderer.invoke("server:probe", url),
    remoteUrls: () => ipcRenderer.invoke("server:remoteUrls"),
  },
  remote: {
    sessions: () => ipcRenderer.invoke("remote:sessions"),
    revokeSession: (id: string) =>
      ipcRenderer.invoke("remote:revokeSession", id),
    revokeAll: () => ipcRenderer.invoke("remote:revokeAll"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (partial: Record<string, unknown>) =>
      ipcRenderer.invoke("settings:set", partial),
  },
  history: {
    get: () => ipcRenderer.invoke("history:get"),
    delete: (id: string) => ipcRenderer.invoke("history:delete", id),
    clear: () => ipcRenderer.invoke("history:clear"),
    replay: (url: string) => ipcRenderer.invoke("history:replay", url),
  },
  player: {
    check: (exe: string) => ipcRenderer.invoke("player:check", exe),
    status: () => ipcRenderer.invoke("player:status"),
    togglePause: () => ipcRenderer.invoke("player:togglePause"),
    skip: () => ipcRenderer.invoke("player:skip"),
    chapterPrev: () => ipcRenderer.invoke("player:chapterPrev"),
    chapterNext: () => ipcRenderer.invoke("player:chapterNext"),
    seek: (position: number) => ipcRenderer.invoke("player:seek", position),
    volume: (value: number) => ipcRenderer.invoke("player:volume", value),
    mute: () => ipcRenderer.invoke("player:mute"),
    speed: (value: number) => ipcRenderer.invoke("player:speed", value),
    stop: () => ipcRenderer.invoke("player:stop"),
  },
  downloads: {
    list: () => ipcRenderer.invoke("downloads:list"),
    start: (id: string) => ipcRenderer.invoke("downloads:start", id),
    delete: (id: string) => ipcRenderer.invoke("downloads:delete", id),
    updateCheck: (id: string) =>
      ipcRenderer.invoke("downloads:updateCheck", id),
  },
  shell: {
    open: (url: string) => ipcRenderer.invoke("shell:open", url),
  },
  dialog: {
    pickExecutable: () => ipcRenderer.invoke("dialog:pickExecutable"),
  },
  window: {
    toggle: () => ipcRenderer.invoke("window:toggle"),
    openHistory: () => ipcRenderer.invoke("window:openHistory"),
    setThemeOverlay: (mode: "dark" | "light") =>
      ipcRenderer.send("window:setThemeOverlay", mode),
    onNavigate: (cb: (tab: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, tab: string) => cb(tab);
      ipcRenderer.on("navigate", listener);
      return () => {
        ipcRenderer.removeListener("navigate", listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
