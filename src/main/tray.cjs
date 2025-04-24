/**
 * @fileoverview Modular Electron system tray integration.
 * Exports setupTray function for use in main process and for unit testing.
 */
const path = require('path');

function setupTray(app, mainWindow, Tray, Menu) {
    const iconPath = path.join(__dirname, '../assets/tray-icon.png');
    const tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show/Hide',
            click: () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: async () => {
                await app.quit();
            }
        }
    ]);
    tray.setToolTip('MCP Desktop');
    tray.setContextMenu(contextMenu);
    return tray;
}

module.exports = { setupTray };
