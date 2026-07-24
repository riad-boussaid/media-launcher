import { join } from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from "electron";
import { deleteDownload, listDownloads, startDownload } from "./downloads";
import { checkPlayerExists } from "./player";
import {
  clearHistory,
  deleteHistory,
  getHistory,
  getServerUrlSync,
  getSettings,
  initDatabase,
  setSettings,
} from "./store";
import { createTray, destroyTray } from "./tray";

if (require("electron-squirrel-startup")) app.quit();

let win: BrowserWindow | null = null;

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

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
      win?.hide();
    }
  });

  win.on("minimize", (event) => {
    event.preventDefault();
    win?.hide();
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
    try {
      const res = await fetch(`${getServerUrlSync()}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ err: res.statusText }));
        return { success: false, error: err.err || res.statusText };
      }
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
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
  await initDatabase();
  const settings = await getSettings();
  app.setLoginItemSettings({ openAtLogin: settings.autoStart });

  registerIPC();
  createWindow();

  if (settings.startMinimized) win?.hide();
  else win?.show();

  createTray(win);

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
});
