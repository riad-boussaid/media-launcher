import { contextBridge, ipcRenderer } from "electron";

const api = {
  server: {
    getToken: () => ipcRenderer.invoke("server:token"),
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
  },
  downloads: {
    list: () => ipcRenderer.invoke("downloads:list"),
    start: (id: string) => ipcRenderer.invoke("downloads:start", id),
    delete: (id: string) => ipcRenderer.invoke("downloads:delete", id),
  },
  shell: {
    open: (url: string) => ipcRenderer.invoke("shell:open", url),
  },
  window: {
    toggle: () => ipcRenderer.invoke("window:toggle"),
    openHistory: () => ipcRenderer.invoke("window:openHistory"),
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
