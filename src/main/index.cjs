// @fileoverview Main entry point for MCP Electron desktop application.
// Implements main window management per phase1.md and phase1_architecture.md

// Load environment variables from .env file first, before any other imports
require('dotenv').config();

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { startCombinedServer } = require(path.join(__dirname, 'combined-server.cjs'));

// Import core services
const monitoringService = require('../core/monitoring-service.cjs');
const errorService = require('../core/error-service.cjs');

// Initialize core services with proper dependency injection
// This must be done before using any of these services
if (errorService && monitoringService) {
    // Set up dependency injection between services
    errorService.setLoggingService(monitoringService);
    
    // Initialize monitoring service if needed
    if (typeof monitoringService.init === 'function') {
        monitoringService.init();
    }
    
    console.log('[Main Process] Core services initialized');
}

// Import IPC handlers
const { initIpcHandlers } = require(path.join(__dirname, 'ipc-handlers.cjs'));

// Add error handlers for Electron
app.on('render-process-gone', (event, webContents, details) => {
  monitoringService.error(`Renderer process gone: ${details.reason}`, { details }, 'electron');
  // Don't exit the app, just log the error
});

// Catch renderer errors
app.on('web-contents-created', (event, contents) => {
  contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    monitoringService.error(
      `Renderer failed to load: ${errorCode} - ${errorDescription}`, 
      { errorCode, errorDescription, validatedURL, isMainFrame }, 
      'electron'
    );
  });
  
  contents.on('crashed', (event, killed) => {
    monitoringService.error(
      `Renderer crashed: ${killed ? 'Killed' : 'Not killed'}`, 
      { killed }, 
      'electron'
    );
    
    const options = {
      type: 'info',
      title: 'Renderer Process Crashed',
      message: 'The renderer process has crashed.',
      buttons: ['Reload', 'Close']
    };
    
    dialog.showMessageBox(options).then(result => {
      if (result.response === 0) {
        monitoringService.info('Reloading crashed renderer', {}, 'electron');
        contents.reload();
      }
    });
  });
});

let mainWindow;
let combinedServer;

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

    // Load from the local server instead of directly from the file
    mainWindow.loadURL('http://localhost:3000');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const { ipcMain } = require('electron');

const { setApplicationMenu } = require(path.join(__dirname, 'menu.cjs'));

const { setupTray } = require(path.join(__dirname, 'tray.cjs'));
let tray;

app.on('ready', async () => {
    // Initialize IPC handlers for monitoring and error services
    const ipcInitialized = initIpcHandlers();
    if (ipcInitialized) {
        monitoringService.info('IPC handlers initialized successfully', {}, 'electron');
    } else {
        monitoringService.error('Failed to initialize IPC handlers', {}, 'electron');
    }
    
    let serverStarted = false;
    
    // Check if server was started by start-mcp.sh (environment variable)
    const externalServerStarted = process.env.MCP_SERVER_STARTED === 'true';
    
    if (externalServerStarted) {
        monitoringService.info('Using externally started server', {}, 'electron');
        serverStarted = true;
    } else {
        // Start the combined server before creating the window
        try {
            monitoringService.info('Starting MCP Desktop application', {}, 'electron');
            combinedServer = await startCombinedServer(3000);
            monitoringService.info('Combined server started successfully', {}, 'electron');
            serverStarted = true;
        } catch (error) {
            monitoringService.error(
                `Failed to start combined server: ${error.message}`, 
                { stack: error.stack }, 
                'electron'
            );
            
            // Show error dialog to user
            dialog.showErrorBox(
                'Server Start Error', 
                `Could not start MCP server: ${error.message}\n\nThe application may not function correctly.`
            );
        }
    }
    
    // Wait a moment to ensure server is fully ready
    setTimeout(() => {
        createMainWindow();
        const { Menu, dialog, Tray } = require('electron');
        setApplicationMenu(Menu, dialog);
        
        // Set up a loading check
        let loadAttempts = 0;
        const maxAttempts = 5;
        const checkLoadingInterval = setInterval(() => {
            if (mainWindow && mainWindow.webContents) {
                loadAttempts++;
                if (serverStarted && mainWindow.webContents.getURL() === '') {
                    // If the URL is empty after the window was created, try loading again
                    monitoringService.info(`Retrying window load (attempt ${loadAttempts})`, {}, 'electron');
                    mainWindow.loadURL('http://localhost:3000');
                } else if (loadAttempts >= maxAttempts) {
                    clearInterval(checkLoadingInterval);
                }
            } else {
                clearInterval(checkLoadingInterval);
            }
        }, 1000);
        
        try {
            tray = setupTray(app, mainWindow, Tray, Menu);
            if (tray) {
                monitoringService.info('Tray icon setup successfully', {}, 'electron');
            } else {
                monitoringService.warn('Tray setup returned null', {}, 'electron');
            }
        } catch (error) {
            monitoringService.error(
                `Failed to set up tray: ${error.message}`, 
                { stack: error.stack }, 
                'electron'
            );
        }
    }, 1000); // Wait 1 second before creating window to ensure server is ready
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

app.on('window-all-closed', async () => {
    monitoringService.info('All windows closed', {}, 'electron');
    
    if (process.platform !== 'darwin') {
        monitoringService.info('Platform is not macOS, quitting application', {}, 'electron');
        
        // Stop the combined server gracefully if it's running
        if (combinedServer) {
            try {
                const { stopCombinedServer } = require(path.join(__dirname, 'combined-server.cjs'));
                await stopCombinedServer();
                monitoringService.info('Combined server stopped successfully', {}, 'electron');
            } catch (error) {
                monitoringService.error(
                    `Error stopping combined server: ${error.message}`, 
                    { stack: error.stack }, 
                    'electron'
                );
            }
        }
        
        monitoringService.info('Quitting application', {}, 'electron');
        app.quit();
    } else {
        monitoringService.info('Platform is macOS, not quitting on window close', {}, 'electron');
    }
});

app.on('activate', () => {
    monitoringService.info('App activated', {}, 'electron');
    if (mainWindow === null) {
        monitoringService.info('Creating new main window on activate', {}, 'electron');
        createMainWindow();
    } else {
        monitoringService.info('Main window already exists, focusing', {}, 'electron');
        mainWindow.focus();
    }
});
