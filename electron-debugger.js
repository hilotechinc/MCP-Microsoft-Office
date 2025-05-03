/**
 * Electron Diagnostic Tool for MCP Desktop
 * This script helps find issues with Electron startup and server connectivity
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// Configure logging
const LOG_FILE = path.join(__dirname, 'electron-debug.log');
const logger = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(LOG_FILE, logMessage);
};

// Start with clean log
if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
}

logger('MCP Desktop Electron diagnostic starting...');

// Check if server is running
function checkServerRunning(port, callback) {
    logger(`Checking if server is running on port ${port}...`);
    
    const req = http.request({
        method: 'GET',
        hostname: 'localhost',
        port: port,
        path: '/api/health',
        timeout: 2000
    }, (res) => {
        logger(`Server response status: ${res.statusCode}`);
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            logger(`Server response: ${data}`);
            callback(null, true);
        });
    });
    
    req.on('error', (err) => {
        logger(`Server connection error: ${err.message}`);
        callback(err, false);
    });
    
    req.end();
}

// Start server as child process
function startServer() {
    logger('Starting combined server as child process...');
    
    const serverProcess = spawn('node', ['src/main/combined-server.cjs'], {
        detached: false,
        stdio: 'pipe'
    });
    
    serverProcess.stdout.on('data', (data) => {
        logger(`SERVER OUTPUT: ${data}`);
    });
    
    serverProcess.stderr.on('data', (data) => {
        logger(`SERVER ERROR: ${data}`);
    });
    
    serverProcess.on('exit', (code) => {
        logger(`Server process exited with code ${code}`);
    });
    
    // Return process for cleanup
    return serverProcess;
}

let serverProcess = null;
let mainWindow = null;

app.on('ready', () => {
    logger('Electron app ready event fired');
    
    // Check if server is already running
    checkServerRunning(3000, (err, running) => {
        if (running) {
            logger('Server already running on port 3000');
            createWindow();
        } else {
            logger('Server not running, starting it now');
            serverProcess = startServer();
            
            // Wait a bit for the server to start
            setTimeout(() => {
                checkServerRunning(3000, (err, running) => {
                    if (running) {
                        logger('Server started successfully');
                        createWindow();
                    } else {
                        logger('Server failed to start after timeout');
                        app.quit();
                    }
                });
            }, 3000);
        }
    });
});

function createWindow() {
    logger('Creating Electron window...');
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'src/main/preload.cjs')
        },
        show: false
    });
    
    // Enable DevTools
    mainWindow.webContents.openDevTools();
    
    // Log various window events
    mainWindow.webContents.on('did-start-loading', () => {
        logger('Window started loading');
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
        logger('Window finished loading');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        logger(`Window failed to load: ${errorCode} - ${errorDescription}`);
    });
    
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        logger(`RENDERER CONSOLE [${level}]: ${message}`);
    });
    
    mainWindow.on('ready-to-show', () => {
        logger('Window ready to show');
        mainWindow.show();
    });
    
    mainWindow.on('closed', () => {
        logger('Window closed');
        mainWindow = null;
    });
    
    logger('Loading URL http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
}

app.on('window-all-closed', () => {
    logger('All windows closed event fired');
    
    // Clean up the server process if we started it
    if (serverProcess) {
        logger('Terminating server process');
        serverProcess.kill();
    }
    
    if (process.platform !== 'darwin') {
        logger('Platform is not macOS, quitting application');
        app.quit();
    }
});

app.on('will-quit', () => {
    logger('App will quit event fired');
    
    // Final cleanup
    if (serverProcess) {
        logger('Terminating server process before quit');
        serverProcess.kill();
    }
});

process.on('exit', () => {
    logger('Process exit event fired');
});

// Handle any uncaught exceptions
process.on('uncaughtException', (err) => {
    logger(`UNCAUGHT EXCEPTION: ${err.message}`);
    logger(err.stack);
});