import { join } from "node:path";
import { app, type BrowserWindow, Menu, nativeImage, Tray } from "electron";
import {
  getPlayerStatus,
  getSettings,
  type PlayerStatus,
  setSettings,
  skipTrack,
  togglePause,
} from "./store";

let tray: Tray | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
// Snapshot of the player state the current menu was built from — the menu is
// only rebuilt when it changes, so an open menu isn't dismissed every 5 s.
let lastMenuState = "";

function displayName(url: string, title: string): string {
  if (title) return title;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function truncate(text: string, max = 50): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function buildMenu(
  win: BrowserWindow,
  player: PlayerStatus,
): Promise<Menu> {
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
  ];

  if (player.alive && player.url) {
    items.push(
      {
        label: `Now playing: ${truncate(player.title || displayName(player.url))}`,
        enabled: false,
      },
      {
        label: player.paused ? "Resume" : "Pause",
        enabled: player.ipcReady,
        click: () => void togglePause(),
      },
      {
        label: "Skip",
        enabled: player.ipcReady,
        click: () => void skipTrack(),
      },
    );
  }

  items.push(
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
  );

  return Menu.buildFromTemplate(items);
}

export function createTray(win: BrowserWindow): void {
  const iconPath = join(__dirname, "../../resources/play.ico");
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip("media-launcher");

  const refresh = async () => {
    try {
      const player = await getPlayerStatus();
      tray?.setToolTip(
        player.alive
          ? `media-launcher — ${truncate(
              player.title || displayName(player.url ?? ""),
            )}`
          : "media-launcher",
      );
      // Rebuild the context menu only when playback state changed.
      const state = JSON.stringify([
        player.alive,
        player.ipcReady,
        player.paused,
        player.title,
        player.queue.length,
      ]);
      if (state !== lastMenuState) {
        lastMenuState = state;
        void buildMenu(win, player).then((menu) => tray?.setContextMenu(menu));
      }
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
  pollTimer = setInterval(() => void refresh(), 5000);
  win.on("show", () => void refresh());
  win.on("hide", () => void refresh());
}

export function refreshTrayMenu(win: BrowserWindow): void {
  if (!tray) return;
  lastMenuState = "";
  void getPlayerStatus()
    .then((player) => buildMenu(win, player))
    .then((menu) => tray?.setContextMenu(menu));
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
