import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell,
} from "electron";
import {
  checkUpdate,
  deleteDownload,
  getBinDir,
  listDownloads,
  startDownload,
} from "./downloads";
import { checkPlayerExists } from "./player";
import {
  getServerStatus,
  probeServerUrl,
  readServerToken,
  startServer,
  stopServer,
} from "./server";
import {
  clearHistory,
  deleteHistory,
  getHistory,
  getSettings,
  initDatabase,
  replayUrl,
  setSettings,
} from "./store";
import { createTray, destroyTray, refreshTrayMenu } from "./tray";

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

  function createWindow(): void {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
      width: 560,
      height: 730,
      x: screenWidth - 570,
      y: screenHeight - 740,
      show: false,
      // Frameless look while keeping native window controls (WCO overlay).
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#14171c",
        symbolColor: "#9aa3b2",
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
    ipcMain.handle("server:probe", (_event, url: string) =>
      probeServerUrl(url),
    );
    ipcMain.handle("settings:get", () => getSettings());
    ipcMain.handle("settings:set", async (_event, partial) => {
      const updated = await setSettings(partial);
      if (partial.autoStart !== undefined) {
        app.setLoginItemSettings({ openAtLogin: partial.autoStart });
      }
      if (win) refreshTrayMenu(win);
      return updated;
    });
    ipcMain.handle("history:get", () => getHistory());
    ipcMain.handle("history:delete", (_event, id) => deleteHistory(id));
    ipcMain.handle("history:clear", () => clearHistory());
    ipcMain.handle("player:check", async (_event, exe) =>
      checkPlayerExists(exe),
    );
    ipcMain.handle("downloads:list", () => listDownloads());
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
  }

  app.whenReady().then(async () => {
    // Drop the default Electron menu (File/Edit/View/Window) — the renderer
    // owns all navigation, and the stock menu makes the app feel unfinished.
    Menu.setApplicationMenu(null);

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

    globalShortcut.register("CommandOrControl+Shift+M", () => {
      if (win) {
        if (win.isVisible()) win.hide();
        else win.show();
      }
    });
  });

  app.on("window-all-closed", () => {});
}
