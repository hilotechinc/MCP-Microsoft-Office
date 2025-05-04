/**
 * @fileoverview IPC handlers for the main process.
 * This file sets up IPC handlers for monitoring and error services.
 */

const { ipcMain } = require('electron');
const path = require('path');

// Import actual services (these are only used in the main process)
let MonitoringService = null;
let ErrorService = null;

/**
 * Initialize the IPC handlers for monitoring and error services
 */
function initIpcHandlers() {
    try {
        // Load the actual services in the main process
        MonitoringService = require('../core/monitoring-service.cjs');
        ErrorService = require('../core/error-service.cjs');
        
        console.log('[IPC] Monitoring and Error services loaded successfully');
        
        // Set up IPC handlers for monitoring service
        setupMonitoringHandlers();
        
        // Set up IPC handlers for error service
        setupErrorHandlers();
        
        console.log('[IPC] IPC handlers initialized successfully');
        return true;
    } catch (error) {
        console.error('[IPC] Failed to initialize IPC handlers:', error);
        return false;
    }
}

/**
 * Set up IPC handlers for the monitoring service
 */
function setupMonitoringHandlers() {
    // Info logging
    ipcMain.on('monitoring:info', (event, args) => {
        const { message, metadata, category } = args;
        if (MonitoringService) {
            MonitoringService.info(message, metadata || {}, category || 'renderer');
        } else {
            console.info(`[${category || 'renderer'}] ${message}`, metadata || {});
        }
    });
    
    // Warning logging
    ipcMain.on('monitoring:warn', (event, args) => {
        const { message, metadata, category } = args;
        if (MonitoringService) {
            MonitoringService.warn(message, metadata || {}, category || 'renderer');
        } else {
            console.warn(`[${category || 'renderer'}] ${message}`, metadata || {});
        }
    });
    
    // Error logging
    ipcMain.on('monitoring:error', (event, args) => {
        const { message, metadata, category } = args;
        if (MonitoringService) {
            MonitoringService.error(message, metadata || {}, category || 'renderer');
        } else {
            console.error(`[${category || 'renderer'}] ${message}`, metadata || {});
        }
    });
    
    // Log error object
    ipcMain.on('monitoring:logError', (event, args) => {
        const { error } = args;
        if (MonitoringService) {
            MonitoringService.logError(error);
        } else {
            console.error('[renderer:error]', error);
        }
    });
    
    // Track metric
    ipcMain.on('monitoring:trackMetric', (event, args) => {
        const { name, value, metadata } = args;
        if (MonitoringService) {
            MonitoringService.trackMetric(name, value, metadata || {});
        } else {
            console.log(`[metric] ${name}: ${value}`, metadata || {});
        }
    });
}

/**
 * Set up IPC handlers for the error service
 */
function setupErrorHandlers() {
    // Create error
    ipcMain.on('error:create', (event, error) => {
        if (ErrorService) {
            // Log the error using the actual ErrorService
            const mcpError = ErrorService.createError(
                error.category || 'renderer',
                error.message,
                error.severity || 'error',
                error.context || {}
            );
            
            // Log the error using MonitoringService
            if (MonitoringService) {
                MonitoringService.logError(mcpError);
            } else {
                console.error('[error:create]', mcpError);
            }
        } else {
            console.error('[error:create] ErrorService not available:', error);
        }
    });
    
    // Service loading request
    ipcMain.on('services:load', (event, serviceName) => {
        console.log(`[IPC] Renderer requested to load service: ${serviceName}`);
        // We don't actually load anything here as services are already loaded in the main process
        // Just acknowledge the request
        event.reply('services:loaded', { success: true, service: serviceName });
    });
}

module.exports = {
    initIpcHandlers
};
