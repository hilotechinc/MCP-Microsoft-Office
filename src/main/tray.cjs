/**
 * @fileoverview Modular Electron system tray integration.
 * Exports setupTray function for use in main process and for unit testing.
 */
const path = require('path');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Log service initialization
MonitoringService.info('Tray service initialized', {
    serviceName: 'tray-service',
    timestamp: new Date().toISOString()
}, 'main');

function setupTray(app, mainWindow, Tray, Menu) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Tray setup started', {
            method: 'setupTray',
            platform: process.platform,
            timestamp: new Date().toISOString()
        }, 'main');
    }
    
    try {
        if (!app || !mainWindow || !Tray || !Menu) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'Missing required parameters for tray setup',
                ErrorService.SEVERITIES.WARNING,
                {
                    service: 'tray-service',
                    method: 'setupTray',
                    hasApp: !!app,
                    hasMainWindow: !!mainWindow,
                    hasTray: !!Tray,
                    hasMenu: !!Menu,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
        
        let trayIconPath;
        const defaultIconPath = path.join(__dirname, 'tray-icon-default.png');
        
        // Check if default icon exists and has content
        const fs = require('fs');
        if (fs.existsSync(defaultIconPath) && fs.statSync(defaultIconPath).size > 0) {
            trayIconPath = defaultIconPath;
            MonitoringService.debug('Using default tray icon', { iconPath: defaultIconPath }, 'main');
        } else {
            // Use electron's default icon as fallback for macOS
            if (process.platform === 'darwin') {
                trayIconPath = path.join(process.resourcesPath, 'electron.icns');
            } else {
                trayIconPath = path.join(process.resourcesPath, 'electron.ico');
            }
            
            MonitoringService.debug('Using fallback platform icon', { 
                platform: process.platform,
                iconPath: trayIconPath 
            }, 'main');
            
            // If still no icon is found, create a temporary empty one (1x1 transparent PNG)
            if (!fs.existsSync(trayIconPath)) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'No tray icon found, some features may not work properly',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'tray-service',
                        method: 'setupTray',
                        attemptedPaths: [defaultIconPath, trayIconPath],
                        platform: process.platform,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                return null;
            }
        }
        
        const tray = new Tray(trayIconPath);
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show/Hide',
                click: () => {
                    try {
                        if (mainWindow.isVisible()) {
                            mainWindow.hide();
                            MonitoringService.trackMetric('tray_action_hide', 1, {
                                service: 'tray-service',
                                action: 'hide_window',
                                timestamp: new Date().toISOString()
                            });
                        } else {
                            mainWindow.show();
                            MonitoringService.trackMetric('tray_action_show', 1, {
                                service: 'tray-service',
                                action: 'show_window',
                                timestamp: new Date().toISOString()
                            });
                        }
                    } catch (error) {
                        const mcpError = ErrorService.createError(
                            ErrorService.CATEGORIES.SYSTEM,
                            `Failed to toggle window visibility: ${error.message}`,
                            ErrorService.SEVERITIES.ERROR,
                            {
                                service: 'tray-service',
                                action: 'toggle_window',
                                stack: error.stack,
                                timestamp: new Date().toISOString()
                            }
                        );
                        MonitoringService.logError(mcpError);
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: async () => {
                    try {
                        MonitoringService.trackMetric('tray_action_quit', 1, {
                            service: 'tray-service',
                            action: 'quit_application',
                            timestamp: new Date().toISOString()
                        });
                        await app.quit();
                    } catch (error) {
                        const mcpError = ErrorService.createError(
                            ErrorService.CATEGORIES.SYSTEM,
                            `Failed to quit application: ${error.message}`,
                            ErrorService.SEVERITIES.ERROR,
                            {
                                service: 'tray-service',
                                action: 'quit_application',
                                stack: error.stack,
                                timestamp: new Date().toISOString()
                            }
                        );
                        MonitoringService.logError(mcpError);
                    }
                }
            }
        ]);
        tray.setToolTip('MCP Desktop');
        tray.setContextMenu(contextMenu);
        
        // On macOS, add a title to make it more visible
        if (process.platform === 'darwin') {
            tray.setTitle('MCP');
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('tray_setup_success', executionTime, {
            service: 'tray-service',
            method: 'setupTray',
            platform: process.platform,
            iconPath: trayIconPath,
            timestamp: new Date().toISOString()
        });
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Tray setup completed successfully', {
                platform: process.platform,
                iconPath: trayIconPath,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'main');
        }
        
        return tray;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService.trackMetric('tray_setup_failure', executionTime, {
                service: 'tray-service',
                method: 'setupTray',
                errorType: error.code || 'validation_error',
                timestamp: new Date().toISOString()
            });
            // Return null to allow the app to continue without the tray
            return null;
        }
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Error setting up tray: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'tray-service',
                method: 'setupTray',
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('tray_setup_failure', executionTime, {
            service: 'tray-service',
            method: 'setupTray',
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Return null to allow the app to continue without the tray
        return null;
    }
}

module.exports = { setupTray };
