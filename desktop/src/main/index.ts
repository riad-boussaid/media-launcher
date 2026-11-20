import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
} from "electron";
import {
  autoUpdateYtDlp,
  cancelDownload,
  checkUpdate,
  deleteDownload,
  getBinDir,
  getToolInfo,
  importTool,
  invalidateSystemCache,
  listDownloads,
  openToolsFolder,
  revealToolPath,
  startDownload,
} from "./downloads";
import { checkPlayerExists } from "./player";
import {
  getRemoteUrls,
  getServerStatus,
  probeServerUrl,
  readServerToken,
  startServer,
  stopServer,
} from "./server";
import {
  addWatchLater,
  chapterNext,
  chapterPrev,
  clearHistory,
  clearPlaybackError,
  clearPlayedPlaylist,
  clearQueue,
  clearWatchLater,
  deleteHistory,
  deleteWatchLater,
  discardSavedQueue,
  getAutoUpdateYtDlp,
  getHistory,
  getPlayerStatus,
  getRemoteSessions,
  getSavedQueue,
  getSettings,
  getWatchLater,
  initDatabase,
  loadMorePlaylist,
  moveQueueItem,
  moveQueueItemTo,
  playQueueItem,
  playWatchLater,
  queueUrl,
  queueWatchLater,
  removePlaylistFromQueue,
  removeQueueItem,
  reorderWatchLater,
  replayUrl,
  resetWatchLaterProgress,
  restoreSavedQueue,
  revokeAllRemoteSessions,
  revokeRemoteSession,
  seekTo,
  setAutoUpdateYtDlp,
  setRepeatMode,
  setSettings,
  setSpeed,
  setVolume,
  shuffleQueue,
  skipTrack,
  stopPlayback,
  toggleMute,
  togglePause,
} from "./store";
import { createTray, destroyTray, refreshTrayMenu } from "./tray";
import { checkAppUpdate, getAppUpdateState } from "./updates";

if (require("electron-squirrel-startup")) app.quit();

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let win: BrowserWindow | null = null;
  let isQuitting = false;

  app.on("before-quit", () => {
    isQuitting = true;
    stopServer();
    destroyTray();
  });

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  // Native titlebar overlay colors per theme; must match the renderer's
  // .titlebar strip (--color-surface / --color-label) in renderer index.css.
  const THEME_OVERLAY = {
    dark: { color: "#14171c", symbolColor: "#9aa3b2" },
    light: { color: "#eceef1", symbolColor: "#5d6572" },
  } as const;

  function createWindow(): void {
    const {
      x: workAreaX,
      y: workAreaY,
      width: screenWidth,
      height: screenHeight,
    } = screen.getPrimaryDisplay().workArea;

    // Breathing room between the window and the work-area edges.
    const EDGE_MARGIN = 12;

    win = new BrowserWindow({
      width: 560,
      // Full available screen height, anchored to the right edge.
      height: screenHeight - EDGE_MARGIN * 2,
      x: workAreaX + screenWidth - 560 - EDGE_MARGIN,
      y: workAreaY + EDGE_MARGIN,
      show: false,
      // Frameless look while keeping native window controls (WCO overlay).
      titleBarStyle: "hidden",
      titleBarOverlay: {
        ...THEME_OVERLAY[nativeTheme.shouldUseDarkColors ? "dark" : "light"],
        height: 36,
      },
      title: "media-launcher",
      icon: join(__dirname, "../../resources/play-256.png"),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL);
      win.webContents.openDevTools({ mode: "detach" });
    } else {
      win.loadFile(join(__dirname, "../renderer/index.html"));
    }

    win.on("close", (event) => {
      if (!isQuitting) {
        event.preventDefault();
        win?.hide();
      }
    });

    win.on("minimize", () => {
      win?.hide();
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http:") || url.startsWith("https:")) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });
  }

  function registerIPC(): void {
    ipcMain.handle("server:token", () => readServerToken());
    ipcMain.handle("server:status", () => getServerStatus());
    ipcMain.handle("updates:state", () => getAppUpdateState());
    ipcMain.handle("updates:check", async () => {
      const update = await checkAppUpdate(true);
      if (win) refreshTrayMenu(win);
      return update;
    });
    ipcMain.handle("server:probe", (_event, url: string) =>
      probeServerUrl(url),
    );
    ipcMain.handle("settings:get", () => getSettings());
    ipcMain.handle("settings:set", async (_event, partial) => {
      const remoteChanged = partial.remoteEnabled !== undefined;
      const updated = await setSettings(partial);
      if (partial.autoStart !== undefined) {
        app.setLoginItemSettings({ openAtLogin: partial.autoStart });
      }
      if (remoteChanged) {
        // The bind address changed — restart the embedded server so the
        // new HOST applies.
        stopServer();
        await startServer();
      }
      if (win) refreshTrayMenu(win);
      return updated;
    });
    ipcMain.handle("server:remoteUrls", (_event, fresh?: boolean) =>
      getRemoteUrls(fresh === true),
    );
    ipcMain.handle("remote:sessions", () => getRemoteSessions());
    ipcMain.handle("remote:revokeSession", (_event, id: string) =>
      revokeRemoteSession(id),
    );
    ipcMain.handle("remote:revokeAll", () => revokeAllRemoteSessions());
    ipcMain.handle("history:get", () => getHistory());
    ipcMain.handle("history:delete", (_event, id) => deleteHistory(id));
    ipcMain.handle("history:clear", () => clearHistory());
    ipcMain.handle("watchLater:get", () => getWatchLater());
    ipcMain.handle(
      "watchLater:add",
      (_event, url: string, title?: string, thumbnail?: string) =>
        addWatchLater(url, title, thumbnail),
    );
    ipcMain.handle("watchLater:delete", (_event, id: string) =>
      deleteWatchLater(id),
    );
    ipcMain.handle("watchLater:clear", () => clearWatchLater());
    ipcMain.handle("watchLater:play", (_event, ids?: string[]) =>
      playWatchLater(ids),
    );
    ipcMain.handle("watchLater:queue", (_event, ids?: string[]) =>
      queueWatchLater(ids),
    );
    ipcMain.handle("watchLater:reorder", (_event, ids: string[]) =>
      reorderWatchLater(ids),
    );
    ipcMain.handle("watchLater:unwatch", (_event, id: string) =>
      resetWatchLaterProgress(id),
    );
    ipcMain.handle("watchLater:export", async () => {
      try {
        const entries = await getWatchLater();
        const result = win
          ? await dialog.showSaveDialog(win, {
              title: "Export Watch Later",
              defaultPath: join(app.getPath("downloads"), "watch-later.json"),
              filters: [{ name: "JSON", extensions: ["json"] }],
            })
          : await dialog.showSaveDialog({
              title: "Export Watch Later",
              defaultPath: join(app.getPath("downloads"), "watch-later.json"),
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
        if (result.canceled || !result.filePath) {
          return { canceled: true };
        }
        const payload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          entries: entries.map((entry) => ({
            url: entry.url,
            title: entry.title,
            thumbnail: entry.thumbnail,
            addedAt: entry.addedAt,
          })),
        };
        await writeFile(
          result.filePath,
          `${JSON.stringify(payload, null, 2)}\n`,
          "utf8",
        );
        return { saved: true, count: entries.length };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    });
    ipcMain.handle("watchLater:import", async () => {
      try {
        const result = win
          ? await dialog.showOpenDialog(win, {
              title: "Import Watch Later",
              properties: ["openFile"],
              filters: [{ name: "JSON", extensions: ["json"] }],
            })
          : await dialog.showOpenDialog({
              title: "Import Watch Later",
              properties: ["openFile"],
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true };
        }
        const raw = await readFile(result.filePaths[0], "utf8");
        const parsed: unknown = JSON.parse(raw);
        let list: unknown[];
        if (Array.isArray(parsed)) {
          list = parsed;
        } else if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { entries?: unknown }).entries)
        ) {
          list = (parsed as { entries: unknown[] }).entries;
        } else {
          return { error: "Unrecognized Watch Later file" };
        }

        let imported = 0;
        let skipped = 0;
        for (const item of list) {
          if (!item || typeof item !== "object") {
            skipped += 1;
            continue;
          }
          const entry = item as {
            url?: unknown;
            title?: unknown;
            thumbnail?: unknown;
            addedAt?: unknown;
          };
          if (typeof entry.url !== "string" || entry.url.length === 0) {
            skipped += 1;
            continue;
          }
          try {
            await addWatchLater(
              entry.url,
              typeof entry.title === "string" ? entry.title : "",
              typeof entry.thumbnail === "string" ? entry.thumbnail : "",
              typeof entry.addedAt === "number" ? entry.addedAt : undefined,
            );
            imported += 1;
          } catch {
            skipped += 1;
          }
        }
        return { imported, skipped };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    });
    ipcMain.handle("player:check", async (_event, exe) =>
      checkPlayerExists(exe),
    );
    ipcMain.handle("player:status", () => getPlayerStatus());
    ipcMain.handle("player:togglePause", () => togglePause());
    ipcMain.handle("player:skip", () => skipTrack());
    ipcMain.handle("player:chapterPrev", () => chapterPrev());
    ipcMain.handle("player:chapterNext", () => chapterNext());
    ipcMain.handle("player:seek", (_event, position: number) =>
      seekTo(position),
    );
    ipcMain.handle("player:volume", (_event, volume: number) =>
      setVolume(volume),
    );
    ipcMain.handle("player:mute", () => toggleMute());
    ipcMain.handle("player:speed", (_event, speed: number) => setSpeed(speed));
    ipcMain.handle("player:stop", () => stopPlayback());
    ipcMain.handle("player:queueRemove", (_event, index: number) =>
      removeQueueItem(index),
    );
    ipcMain.handle(
      "player:queueMove",
      (_event, index: number, direction: "up" | "down") =>
        moveQueueItem(index, direction),
    );
    ipcMain.handle(
      "player:queueMoveTo",
      (_event, index: number, target: number) => moveQueueItemTo(index, target),
    );
    ipcMain.handle("player:queueShuffle", () => shuffleQueue());
    ipcMain.handle("player:repeat", (_event, mode: "off" | "one" | "all") =>
      setRepeatMode(mode),
    );
    ipcMain.handle("player:queuePlay", (_event, index: number) =>
      playQueueItem(index),
    );
    ipcMain.handle(
      "player:loadMorePlaylist",
      (_event, playlistUrl: string, playlistId: string) =>
        loadMorePlaylist(playlistUrl, playlistId),
    );
    ipcMain.handle("player:savedQueue", () => getSavedQueue());
    ipcMain.handle("player:restoreSavedQueue", () => restoreSavedQueue());
    ipcMain.handle("player:discardSavedQueue", () => discardSavedQueue());
    ipcMain.handle("player:queueClear", () => clearQueue());
    ipcMain.handle("player:queueRemovePlaylist", (_event, playlistId: string) =>
      removePlaylistFromQueue(playlistId),
    );
    ipcMain.handle("player:queueClearPlayed", (_event, playlistId?: string) =>
      clearPlayedPlaylist(playlistId),
    );
    ipcMain.handle("player:clearError", () => clearPlaybackError());
    ipcMain.handle("downloads:list", () => listDownloads());
    ipcMain.handle("downloads:recheck", () => {
      invalidateSystemCache();
      return listDownloads();
    });
    ipcMain.handle("downloads:info", () => getToolInfo());
    ipcMain.handle("downloads:import", () => importTool());
    ipcMain.handle("downloads:openFolder", () => openToolsFolder());
    ipcMain.handle("downloads:reveal", (_event, path: string) =>
      revealToolPath(path),
    );
    ipcMain.handle("downloads:cancel", (_event, id: string) =>
      cancelDownload(id),
    );
    ipcMain.handle("downloads:autoUpdate", () => getAutoUpdateYtDlp());
    ipcMain.handle("downloads:setAutoUpdate", (_event, enabled: boolean) => {
      setAutoUpdateYtDlp(enabled === true);
      return getAutoUpdateYtDlp();
    });
    ipcMain.handle("downloads:start", async (_event, id) => {
      await startDownload(id);
      return listDownloads();
    });
    ipcMain.handle("downloads:delete", async (_event, id) => {
      await deleteDownload(id);
      return listDownloads();
    });
    ipcMain.handle("downloads:updateCheck", (_event, id: string) =>
      checkUpdate(id),
    );
    ipcMain.handle("shell:open", (_event, url) => {
      if (
        typeof url === "string" &&
        (url.startsWith("http:") || url.startsWith("https:"))
      ) {
        return shell.openExternal(url);
      }
      return Promise.resolve();
    });
    ipcMain.handle("dialog:pickExecutable", async () => {
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        title: "Locate player executable",
        properties: ["openFile"],
        filters:
          process.platform === "win32"
            ? [{ name: "Executables", extensions: ["exe"] }]
            : undefined,
      });
      return result.filePaths[0] ?? null;
    });
    ipcMain.handle("history:replay", (_event, url) => replayUrl(url));
    ipcMain.handle("history:queue", (_event, url) => queueUrl(url));
    ipcMain.handle("window:openHistory", () => {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.webContents.send("navigate", "history");
      }
    });
    ipcMain.handle("window:toggle", () => {
      if (win) {
        if (win.isVisible()) win.hide();
        else win.show();
      }
    });
    ipcMain.on("window:setThemeOverlay", (_event, mode: "dark" | "light") => {
      try {
        // Only supported where window controls overlay is available (Windows).
        win?.setTitleBarOverlay(THEME_OVERLAY[mode] ?? THEME_OVERLAY.dark);
      } catch {
        // No-op on platforms without WCO support.
      }
    });
  }

  app.whenReady().then(async () => {
    // Drop the default Electron menu on Windows/Linux — the renderer owns all
    // navigation. macOS keeps the standard app/edit/window menus so Cmd+Q,
    // Cmd+W, copy/paste, and the Dock menu keep working.
    if (process.platform === "darwin") {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: "appMenu" },
          { role: "editMenu" },
          { role: "windowMenu" },
        ]),
      );
    } else {
      Menu.setApplicationMenu(null);
    }

    await startServer();
    await initDatabase();
    const settings = await getSettings();
    app.setLoginItemSettings({ openAtLogin: settings.autoStart });

    try {
      await setSettings({ binDir: getBinDir() });
    } catch {
      // Server may be unreachable; binDir will be synced on next save.
    }

    registerIPC();
    createWindow();

    if (!win) return;

    if (settings.startMinimized) win.hide();
    else win.show();

    createTray(win);

    const runAutoUpdate = () => {
      if (!getAutoUpdateYtDlp()) return;
      void autoUpdateYtDlp().catch((err) => {
        console.warn(
          `[download] automatic yt-dlp update failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    };
    runAutoUpdate();
    const autoUpdateTimer = setInterval(runAutoUpdate, 12 * 60 * 60 * 1000);
    autoUpdateTimer.unref?.();

    const checkUpdates = () => {
      void checkAppUpdate().then((update) => {
        if (update.updateAvailable && win) refreshTrayMenu(win);
      });
    };
    checkUpdates();
    const updateTimer = setInterval(checkUpdates, 12 * 60 * 60 * 1000);
    updateTimer.unref?.();

    globalShortcut.register("CommandOrControl+Shift+M", () => {
      if (win) {
        if (win.isVisible()) win.hide();
        else win.show();
      }
    });
  });

  app.on("window-all-closed", () => {});

  // macOS: clicking the Dock icon after hiding the window should bring it back.
  app.on("activate", () => {
    win?.show();
    win?.focus();
  });
}
