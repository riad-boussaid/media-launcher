import { app, Tray, Menu, BrowserWindow, nativeImage } from "electron";
import { join } from "path";
import { getSettings, setSettings } from "./store";

let tray: Tray | null = null;

export function createTray(win: BrowserWindow): void {
  const iconPath = join(__dirname, "../../resources/icon.ico");
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip("media-launcher");

  const updateMenu = () => {
    const settings = getSettings();
    const contextMenu = Menu.buildFromTemplate([
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
        label: "Start on boot",
        type: "checkbox",
        checked: settings.autoStart,
        click: () => {
          const newVal = !settings.autoStart;
          setSettings({ autoStart: newVal });
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
    ]);
    tray!.setContextMenu(contextMenu);
  };

  tray.on("click", () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  });

  updateMenu();
  win.on("show", updateMenu);
  win.on("hide", updateMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
