import { contextBridge, ipcRenderer } from "electron";

const api = {
  platform: process.platform,
  server: {
    getToken: () => ipcRenderer.invoke("server:token"),
    status: () => ipcRenderer.invoke("server:status"),
    probe: (url: string) => ipcRenderer.invoke("server:probe", url),
    remoteUrls: (fresh?: boolean) =>
      ipcRenderer.invoke("server:remoteUrls", fresh === true),
  },
  updates: {
    state: () => ipcRenderer.invoke("updates:state"),
    check: () => ipcRenderer.invoke("updates:check"),
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
    queue: (url: string) => ipcRenderer.invoke("history:queue", url),
  },
  watchLater: {
    get: () => ipcRenderer.invoke("watchLater:get"),
    add: (url: string, title?: string, thumbnail?: string, addedAt?: number) =>
      ipcRenderer.invoke("watchLater:add", url, title, thumbnail, addedAt),
    delete: (id: string) => ipcRenderer.invoke("watchLater:delete", id),
    clear: () => ipcRenderer.invoke("watchLater:clear"),
    play: (ids?: string[]) => ipcRenderer.invoke("watchLater:play", ids),
    queue: (ids?: string[]) => ipcRenderer.invoke("watchLater:queue", ids),
    reorder: (ids: string[]) => ipcRenderer.invoke("watchLater:reorder", ids),
    unwatch: (id: string) => ipcRenderer.invoke("watchLater:unwatch", id),
    exportFile: () => ipcRenderer.invoke("watchLater:export"),
    importFile: () => ipcRenderer.invoke("watchLater:import"),
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
    queueRemove: (index: number) =>
      ipcRenderer.invoke("player:queueRemove", index),
    queueMove: (index: number, direction: "up" | "down") =>
      ipcRenderer.invoke("player:queueMove", index, direction),
    queueMoveTo: (index: number, target: number) =>
      ipcRenderer.invoke("player:queueMoveTo", index, target),
    queueShuffle: () => ipcRenderer.invoke("player:queueShuffle"),
    setRepeat: (mode: "off" | "one" | "all") =>
      ipcRenderer.invoke("player:repeat", mode),
    queuePlay: (index: number) => ipcRenderer.invoke("player:queuePlay", index),
    queueClear: () => ipcRenderer.invoke("player:queueClear"),
    loadMorePlaylist: (playlistUrl: string, playlistId: string) =>
      ipcRenderer.invoke("player:loadMorePlaylist", playlistUrl, playlistId),
    savedQueue: () => ipcRenderer.invoke("player:savedQueue"),
    restoreSavedQueue: () => ipcRenderer.invoke("player:restoreSavedQueue"),
    discardSavedQueue: () => ipcRenderer.invoke("player:discardSavedQueue"),
    queueRemovePlaylist: (playlistId: string) =>
      ipcRenderer.invoke("player:queueRemovePlaylist", playlistId),
    queueClearPlayed: (playlistId?: string) =>
      ipcRenderer.invoke("player:queueClearPlayed", playlistId),
    clearError: () => ipcRenderer.invoke("player:clearError"),
  },
  downloads: {
    list: () => ipcRenderer.invoke("downloads:list"),
    recheck: () => ipcRenderer.invoke("downloads:recheck"),
    info: () => ipcRenderer.invoke("downloads:info"),
    import: () => ipcRenderer.invoke("downloads:import"),
    openFolder: () => ipcRenderer.invoke("downloads:openFolder"),
    reveal: (path: string) => ipcRenderer.invoke("downloads:reveal", path),
    cancel: (id: string) => ipcRenderer.invoke("downloads:cancel", id),
    getAutoUpdate: () => ipcRenderer.invoke("downloads:autoUpdate"),
    setAutoUpdate: (enabled: boolean) =>
      ipcRenderer.invoke("downloads:setAutoUpdate", enabled),
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
