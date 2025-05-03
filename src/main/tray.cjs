/**
 * @fileoverview Modular Electron system tray integration.
 * Exports setupTray function for use in main process and for unit testing.
 */
const path = require('path');

function setupTray(app, mainWindow, Tray, Menu) {
    try {
        let trayIconPath;
        const defaultIconPath = path.join(__dirname, 'tray-icon-default.png');
        
        // Check if default icon exists and has content
        const fs = require('fs');
        if (fs.existsSync(defaultIconPath) && fs.statSync(defaultIconPath).size > 0) {
            trayIconPath = defaultIconPath;
        } else {
            // Use electron's default icon as fallback for macOS
            if (process.platform === 'darwin') {
                trayIconPath = path.join(process.resourcesPath, 'electron.icns');
            } else {
                trayIconPath = path.join(process.resourcesPath, 'electron.ico');
            }
            
            // If still no icon is found, create a temporary empty one (1x1 transparent PNG)
            if (!fs.existsSync(trayIconPath)) {
                console.warn('No tray icon found, some features may not work properly');
                return null;
            }
        }
        
        const tray = new Tray(trayIconPath);
        
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
        
        // On macOS, add a title to make it more visible
        if (process.platform === 'darwin') {
            tray.setTitle('MCP');
        }
        
        return tray;
    } catch (error) {
        console.error('Error setting up tray:', error);
        // Return null to allow the app to continue without the tray
        return null;
    }
}

module.exports = { setupTray };
