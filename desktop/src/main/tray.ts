import { join } from "node:path";
import {
  app,
  type BrowserWindow,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import {
  getPlayerStatus,
  getSettings,
  type PlayerStatus,
  setSettings,
  skipTrack,
  togglePause,
} from "./store";
import { getAppUpdateState } from "./updates";

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

  const update = getAppUpdateState();
  if (update?.updateAvailable) {
    items.push(
      {
        label: `Update available: v${update.latestVersion}`,
        click: () => {
          const url = update.downloadUrl ?? update.releaseUrl;
          if (url) void shell.openExternal(url);
        },
      },
      { type: "separator" },
    );
  }

  if (player.alive && player.url) {
    items.push(
      {
        label: `Now playing: ${truncate(
          player.title || displayName(player.url, ""),
        )}`,
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
        app.quit();
      },
    },
  );

  return Menu.buildFromTemplate(items);
}

export function createTray(win: BrowserWindow): void {
  // Windows trays accept ICO; macOS/Linux want PNG. macOS menu-bar icons are
  // sized in points, so render the 32px asset down to 16pt.
  const iconFile = process.platform === "win32" ? "play.ico" : "play-32.png";
  let icon = nativeImage.createFromPath(
    join(__dirname, "../../resources", iconFile),
  );
  if (process.platform === "darwin") {
    icon = icon.resize({ width: 16, height: 16 });
    icon.setTemplateImage(false);
  }

  tray = new Tray(icon);
  tray.setToolTip("media-launcher");

  const refresh = async () => {
    try {
      const player = await getPlayerStatus();
      const updateSuffix = getAppUpdateState()?.updateAvailable
        ? " — update available"
        : "";
      const tooltip = player.alive
        ? `media-launcher — ${truncate(
            player.title || displayName(player.url ?? "", ""),
          )}`
        : "media-launcher";
      tray?.setToolTip(tooltip + updateSuffix);
      // Rebuild the context menu only when playback or update state changed.
      const state = JSON.stringify([
        player.alive,
        player.ipcReady,
        player.paused,
        player.title,
        player.queue.length,
        getAppUpdateState()?.latestVersion,
        getAppUpdateState()?.updateAvailable,
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
