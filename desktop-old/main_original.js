const { 
 app,
 BrowserWindow,
 Tray,
 Menu,
 nativeImage,
 screen ,
 ipcMain
 } 
 = require('electron');

// run this as early in the main process as possible
if (require('electron-squirrel-startup')) app.quit();
let AutoLaunch = require('auto-launch');

require('../server/server.js');

const path = require('path');

let tray

app.whenReady().then(() => {

    let autoLaunch = new AutoLaunch({
        name: 'mpv2',
        path: app.getPath('exe'),
    });

    const icon = nativeImage.createFromPath(path.join(__dirname, 'mpv-icon.ico'))
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    const win = new BrowserWindow({
        show: false,
        width: 460,
        height: 660,
        x: width - 470,
        y: height - 670,
        autoHideMenuBar: false,
        frame: true,
        icon: icon,
        title: "play with mpv",
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),

        },
    })

    //win.loadFile('../server/run.bat')
    win.loadURL('http://localhost:5000/history');
    win.webContents.openDevTools(); 

    win.on('minimize', function (event) {
        event.preventDefault();
        win.hide();
        // Template[0].label = 'Show';
        // tray.setContextMenu(Menu.buildFromTemplate(Template))
    });

    win.on('close', function (event) {
        if (!app.isQuiting) {
            event.preventDefault();
            win.hide();
            // Template[0].label = 'Show';
            // tray.setContextMenu(Menu.buildFromTemplate(Template))
        }

        return false;
    });


    // win.on('blur', () => {
    //     if (win.isVisible()) {
    //         win.hide();
    //         Template[0].label = 'Show';
    //         tray.setContextMenu(Menu.buildFromTemplate(Template))
    //     }
    // });
    const Template = [
        {
            label: 'Show/Hide',
            click: () => {
                if (!win.isVisible()) {
                    win.show();
                    // Template[0].label = 'Hide';
                    // tray.setContextMenu(Menu.buildFromTemplate(Template))

                } else {
                    win.hide();
                    // Template[0].label = 'Show';
                    // tray.setContextMenu(Menu.buildFromTemplate(Template));

                }
            }
        },
        {
            label: 'Start up',
            type: 'checkbox',
            click: () => {
                autoLaunch.isEnabled().then((isEnabled) => {
                    if (!isEnabled) autoLaunch.enable();
                    else autoLaunch.disable();
                });
            }
        },
        {
            label: 'Quit',
            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ];
    const contextMenu = Menu.buildFromTemplate(Template);

    tray = new Tray(icon)
    tray.setContextMenu(contextMenu)
    tray.setToolTip('Play With MPV')
    tray.setTitle('Play With MPV')
    tray.on('click', () => {
        if (!win.isVisible()) {
            win.show();
        } else win.hide()
    })
})

