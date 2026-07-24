import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from "electron";
import { join } from "path";
import { startServer, stopServer } from "./server";
import { createTray, destroyTray } from "./tray";
import { launchPlayer, checkPlayerExists } from "./player";
import { initDatabase, getSettings, setSettings, getHistory, deleteHistory, clearHistory, addHistory, updateHistoryEntry } from "./store";
import { fetchMetadata } from "./metadata";
import { listDownloads, startDownload, deleteDownload } from "./downloads";

if (require("electron-squirrel-startup")) app.quit();

let win: BrowserWindow | null = null;

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 520,
    height: 680,
    x: screenWidth - 530,
    y: screenHeight - 690,
    show: false,
    frame: true,
    title: "media-launcher",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win!.hide();
    }
  });

  win.on("minimize", (event) => {
    event.preventDefault();
    win!.hide();
  });
}

function registerIPC(): void {
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_event, partial) => setSettings(partial));
  ipcMain.handle("history:get", () => getHistory());
  ipcMain.handle("history:delete", (_event, id) => deleteHistory(id));
  ipcMain.handle("history:clear", () => clearHistory());
  ipcMain.handle("player:check", async (_event, exe) => checkPlayerExists(exe));
  ipcMain.handle("downloads:list", () => listDownloads());
  ipcMain.handle("downloads:start", async (_event, id) => {
    await startDownload(id);
    return listDownloads();
  });
  ipcMain.handle("downloads:delete", async (_event, id) => {
    await deleteDownload(id);
    return listDownloads();
  });
  ipcMain.handle("shell:open", (_event, url) => shell.openExternal(url));
  ipcMain.handle("history:replay", async (_event, url) => {
    const result = await launchPlayer(url, [], getSettings());
    if (!result.success) return result;
    const entry = addHistory(url);
    const meta = await fetchMetadata(url);
    if (meta.title || meta.thumbnail) {
      updateHistoryEntry(entry.id, meta);
    }
    return result;
  });
  ipcMain.handle("window:toggle", () => {
    if (win) {
      if (win.isVisible()) win.hide();
      else win.show();
    }
  });
}

app.whenReady().then(async () => {
  await initDatabase();
  const settings = getSettings();
  app.setLoginItemSettings({ openAtLogin: settings.autoStart });

  startServer(settings.port);
  registerIPC();
  createWindow();

  if (settings.startMinimized) win!.hide();
  else win!.show();

  createTray(win!);

  globalShortcut.register("CommandOrControl+Shift+M", () => {
    if (win) {
      if (win.isVisible()) win.hide();
      else win.show();
    }
  });
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  destroyTray();
  stopServer();
});
