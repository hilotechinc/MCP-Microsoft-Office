// @fileoverview System tray setup for MCP Electron app (CommonJS)
const { Tray, Menu } = require('electron');
const path = require('path');

function setupTray(app, mainWindow) {
    const trayIcon = path.join(__dirname, '../build/icon.png');
    const tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                if (mainWindow) mainWindow.show();
            }
        },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);
    tray.setToolTip('MCP Desktop');
    tray.setContextMenu(contextMenu);
    return tray;
}

module.exports = { setupTray };
