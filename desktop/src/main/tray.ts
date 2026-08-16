import { join } from "node:path";
import { app, type BrowserWindow, Menu, nativeImage, Tray } from "electron";
import { getNowPlaying, getSettings, setSettings } from "./store";

let tray: Tray | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function displayName(url: string, title: string): string {
  if (title) return title;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

async function buildMenu(win: BrowserWindow): Promise<Menu> {
  const settings = await getSettings();

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Show/Hide",
      click: () => {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
        }
      },
    },
    {
      label: "Open History",
      click: () => {
        if (win.isVisible()) win.hide();
        win.show();
        win.webContents.send("navigate", "history");
      },
    },
    {
      label: "Start on boot",
      type: "checkbox",
      checked: settings.autoStart,
      click: async () => {
        const newVal = !settings.autoStart;
        await setSettings({ autoStart: newVal });
        app.setLoginItemSettings({ openAtLogin: newVal });
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ];

  return Menu.buildFromTemplate(items);
}

export function createTray(win: BrowserWindow): void {
  const iconPath = join(__dirname, "../../resources/play.ico");
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip("media-launcher");

  const refresh = async () => {
    try {
      const nowPlaying = await getNowPlaying();
      tray?.setToolTip(
        nowPlaying
          ? `media-launcher — ${displayName(nowPlaying.url, nowPlaying.title)}`
          : "media-launcher",
      );
    } catch {
      // Server unreachable — keep last known state
    }
  };

  tray.on("click", () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  });

  void refresh();
  void buildMenu(win).then((menu) => tray?.setContextMenu(menu));
  pollTimer = setInterval(() => void refresh(), 5000);
  win.on("show", () => void refresh());
  win.on("hide", () => void refresh());
}

export function refreshTrayMenu(win: BrowserWindow): void {
  if (!tray) return;
  void buildMenu(win).then((menu) => tray?.setContextMenu(menu));
}

export function destroyTray(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
