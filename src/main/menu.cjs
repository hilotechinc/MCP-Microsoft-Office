/**
 * @fileoverview Exports modular Electron application menu template and setup function.
 * Allows for unit testing of menu structure and custom items.
 */
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Log service initialization
MonitoringService.info('Menu service initialized', {
    serviceName: 'menu-service',
    timestamp: new Date().toISOString()
}, 'main');
const getMenuTemplate = (dialog) => [
    {
        label: 'File',
        submenu: [
            { role: 'quit' }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' }, { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' }, { role: 'copy' }, { role: 'paste' }
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'toggledevtools' },
            { type: 'separator' },
            { role: 'resetzoom' }, { role: 'zoomin' }, { role: 'zoomout' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    {
        label: 'Window',
        submenu: [
            { role: 'minimize' }, { role: 'close' }
        ]
    },
    {
        label: 'Help',
        submenu: [
            {
                label: 'About MCP Desktop',
                click: async () => {
                    try {
                        MonitoringService.trackMetric('menu_action_about', 1, {
                            service: 'menu-service',
                            action: 'show_about_dialog',
                            timestamp: new Date().toISOString()
                        });
                        
                        if (dialog) {
                            dialog.showMessageBox({
                                type: 'info',
                                title: 'About',
                                message: 'MCP Desktop\nVersion 0.1.0\nMicrosoft Cloud Platform Client'
                            });
                        } else {
                            const mcpError = ErrorService.createError(
                                ErrorService.CATEGORIES.VALIDATION,
                                'Dialog service not available for about dialog',
                                ErrorService.SEVERITIES.WARNING,
                                {
                                    service: 'menu-service',
                                    action: 'show_about_dialog',
                                    timestamp: new Date().toISOString()
                                }
                            );
                            MonitoringService.logError(mcpError);
                        }
                    } catch (error) {
                        const mcpError = ErrorService.createError(
                            ErrorService.CATEGORIES.SYSTEM,
                            `Failed to show about dialog: ${error.message}`,
                            ErrorService.SEVERITIES.ERROR,
                            {
                                service: 'menu-service',
                                action: 'show_about_dialog',
                                stack: error.stack,
                                timestamp: new Date().toISOString()
                            }
                        );
                        MonitoringService.logError(mcpError);
                    }
                }
            }
        ]
    }
];

function setApplicationMenu(Menu, dialog) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Menu setup started', {
            method: 'setApplicationMenu',
            hasMenu: !!Menu,
            hasDialog: !!dialog,
            timestamp: new Date().toISOString()
        }, 'main');
    }
    
    try {
        if (!Menu) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'Menu service not provided to setApplicationMenu',
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'menu-service',
                    method: 'setApplicationMenu',
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
        
        const template = getMenuTemplate(dialog);
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('menu_setup_success', executionTime, {
            service: 'menu-service',
            method: 'setApplicationMenu',
            menuItems: template.length,
            timestamp: new Date().toISOString()
        });
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Menu setup completed successfully', {
                menuItems: template.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'main');
        }
        
        return template;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService.trackMetric('menu_setup_failure', executionTime, {
                service: 'menu-service',
                method: 'setApplicationMenu',
                errorType: error.code || 'validation_error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Failed to set application menu: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'menu-service',
                method: 'setApplicationMenu',
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('menu_setup_failure', executionTime, {
            service: 'menu-service',
            method: 'setApplicationMenu',
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

module.exports = { getMenuTemplate, setApplicationMenu };
