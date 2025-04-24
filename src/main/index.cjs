// @fileoverview Main entry point for MCP Electron desktop application.
// Implements main window management per phase1.md and phase1_architecture.md

const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        },
        show: false // Show after ready-to-show
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const { ipcMain } = require('electron');

const { setApplicationMenu } = require('./menu');

const { setupTray } = require('./tray');
let tray;

app.on('ready', () => {
    createMainWindow();
    const { Menu, dialog, Tray } = require('electron');
    setApplicationMenu(Menu, dialog);
    tray = setupTray(app, mainWindow, Tray, Menu);
});


/**
 * Handle ping from renderer.
 */
ipcMain.handle('ping', async () => {
    return 'pong';
});

/**
 * Handle sendQuery from renderer (stub for now)
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} query
 * @returns {Promise<any>}
 */
ipcMain.handle('send-query', async (event, query) => {
    // TODO: Implement actual query processing logic
    try {
        // For now, just echo the query
        return { ok: true, echo: query };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createMainWindow();
    }
});
