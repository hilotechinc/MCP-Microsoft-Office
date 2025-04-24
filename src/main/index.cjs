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
            preload: path.join(__dirname, 'preload.js')
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

const { setApplicationMenu } = require('./menu.cjs');

const { setupTray } = require('./tray.cjs');
let tray;

app.on('ready', () => {
    createMainWindow();
    const { Menu, dialog, Tray } = require('electron');
    setApplicationMenu();
    tray = setupTray(app, mainWindow);
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
