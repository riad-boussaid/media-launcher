const { app, Tray, Menu } = require("electron");
if (require("electron-squirrel-startup")) app.quit();

require("./server/server.js");

app.whenReady().then(() => {
  let tray = new Tray("mpv-icon.ico");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
});
