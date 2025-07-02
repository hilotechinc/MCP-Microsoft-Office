/**
 * @fileoverview IPC handlers for the main process.
 * This file sets up IPC handlers for monitoring and error services.
 */

const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');

// Import actual services (these are only used in the main process)
let MonitoringService = null;
let ErrorService = null;
let eventService = null;

/**
 * Initialize the IPC handlers for monitoring and error services
 */
function initIpcHandlers() {
    try {
        // Load the actual services in the main process
        MonitoringService = require('../core/monitoring-service.cjs');
        ErrorService = require('../core/error-service.cjs');
        eventService = require('../core/event-service.cjs');
        
        if (MonitoringService) {
            MonitoringService.info('Monitoring and Error services loaded successfully', {}, 'ipc');
        }
        
        // Set up IPC handlers for monitoring service
        setupMonitoringHandlers();
        
        // Set up IPC handlers for error service
        setupErrorHandlers();
        
        // Set up API handlers
        setupAPIHandlers();
        
        // Set up event forwarding to renderer
        setupEventForwarding();
        
        if (MonitoringService) {
            MonitoringService.info('IPC handlers initialized successfully', {}, 'ipc');
        }
        return true;
    } catch (error) {
        if (MonitoringService) {
            MonitoringService.error('Failed to initialize IPC handlers', { error: error.message, stack: error.stack }, 'ipc');
        } else {
            process.stderr.write(`[IPC] Failed to initialize IPC handlers: ${error.message}\n`);
        }
        return false;
    }
}

/**
 * Test function to trigger an error for testing the error reporting system
 */
ipcMain.on('test:trigger:error', (event, args) => {
    try {
        process.stdout.write(`[IPC DEBUG] Received test:trigger:error request\n`);
        
        if (ErrorService && MonitoringService) {
            // Create multiple test errors to verify event forwarding
            process.stdout.write(`[IPC DEBUG] Creating test errors\n`);
            
            // Create an error using ErrorService
            const testError = ErrorService.createError(
                'test', 
                'Test error triggered for debugging', 
                'error',
                { source: 'test-trigger', timestamp: new Date().toISOString() }
            );
            
            // Log error directly using MonitoringService
            process.stdout.write(`[IPC DEBUG] Logging error directly via MonitoringService.error()\n`);
            MonitoringService.error('Direct test error from main process', { test: true, source: 'main-process-test' }, 'test');
            
            // Also log a warning to test that channel
            process.stdout.write(`[IPC DEBUG] Logging warning via MonitoringService.warn()\n`);
            MonitoringService.warn('Test warning from main process', { test: true }, 'test');
            
            // And log an info message
            process.stdout.write(`[IPC DEBUG] Logging info via MonitoringService.info()\n`);
            MonitoringService.info('Test info from main process', { test: true }, 'test');
            
            event.returnValue = true;
        } else {
            process.stderr.write(`[IPC] Cannot trigger test error: services not available\n`);
            event.returnValue = false;
        }
    } catch (error) {
        process.stderr.write(`[IPC] Failed to trigger test error: ${error.message}\n`);
        event.returnValue = false;
    }
});

/**
 * Set up IPC handlers for monitoring service
 */
function setupMonitoringHandlers() {
    // Info logging
    ipcMain.on('monitoring:info', (event, args) => {
        const { message, metadata, category } = args;
        if (MonitoringService) {
            MonitoringService.info(message, metadata || {}, category || 'renderer');
        } else {
            // Fallback when MonitoringService is not available
            process.stdout.write(`[${category || 'renderer'}] ${message} ${JSON.stringify(metadata || {})}\n`);
        }
    });
    
    // Warning logging
    ipcMain.on('monitoring:warn', (event, args) => {
        const { message, metadata, category } = args;
        if (MonitoringService) {
            MonitoringService.warn(message, metadata || {}, category || 'renderer');
        } else {
            // Fallback when MonitoringService is not available
            process.stderr.write(`[${category || 'renderer'}] ${message} ${JSON.stringify(metadata || {})}\n`);
        }
    });
    
    // Error logging
    ipcMain.on('monitoring:error', (event, args) => {
        const { message, metadata, category } = args;
        if (MonitoringService) {
            MonitoringService.error(message, metadata || {}, category || 'renderer');
        } else {
            // Fallback when MonitoringService is not available
            process.stderr.write(`[${category || 'renderer'}] ${message} ${JSON.stringify(metadata || {})}\n`);
        }
    });
    
    // Log error object
    ipcMain.on('monitoring:logError', (event, args) => {
        const { error } = args;
        if (MonitoringService) {
            MonitoringService.logError(error);
        } else {
            // Fallback when MonitoringService is not available
            process.stderr.write(`[renderer:error] ${JSON.stringify(error)}\n`);
        }
    });
    
    // Track metric
    ipcMain.on('monitoring:trackMetric', (event, args) => {
        const { name, value, metadata } = args;
        if (MonitoringService) {
            MonitoringService.trackMetric(name, value, metadata || {});
        } else {
            // Fallback when MonitoringService is not available
            process.stdout.write(`[metric] ${name}: ${value} ${JSON.stringify(metadata || {})}\n`);
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
                // Fallback when MonitoringService is not available
                process.stderr.write(`[error:create] ${JSON.stringify(mcpError)}\n`);
            }
        } else {
            // Fallback when ErrorService is not available
            process.stderr.write(`[error:create] ErrorService not available: ${JSON.stringify(error)}\n`);
        }
    });
    
    // Service loading request
    ipcMain.on('services:load', (event, serviceName) => {
        if (MonitoringService) {
            MonitoringService.debug('Renderer requested to load service', { serviceName }, 'ipc');
        }
        // We don't actually load anything here as services are already loaded in the main process
        // Just acknowledge the request
        event.reply('services:loaded', { success: true, service: serviceName });
    });
}

/**
 * Set up API handlers for the renderer to access backend API
 */
function setupAPIHandlers() {
    const axios = require('axios');
    const BASE_URL = 'http://localhost:3000';
    
    // Status endpoint
    ipcMain.handle('api:status', async () => {
        try {
            const response = await axios.get(`${BASE_URL}/api/status`);
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to fetch status', { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
    
    // Logs endpoint
    ipcMain.handle('api:logs', async (event, data) => {
        try {
            // Check if this is a clear action
            if (data && data.action === 'clear') {
                const response = await axios.delete(`${BASE_URL}/api/v1/logs`);
                return response.data;
            } else {
                // Regular fetch logs
                const response = await axios.get(`${BASE_URL}/api/v1/logs`, { params: data });
                return response.data;
            }
        } catch (error) {
            if (MonitoringService) {
                const action = data && data.action === 'clear' ? 'clear logs' : 'fetch logs';
                MonitoringService.error(`Failed to ${action}`, { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
    
    // Mail endpoint
    ipcMain.handle('api:mail', async (event, data) => {
        try {
            const response = await axios.get(`${BASE_URL}/api/v1/mail`, { params: data });
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to fetch mail', { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
    
    // Calendar endpoint
    ipcMain.handle('api:calendar', async (event, data) => {
        try {
            const response = await axios.get(`${BASE_URL}/api/v1/calendar`, { params: data });
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to fetch calendar', { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
    
    // Files endpoint
    ipcMain.handle('api:files', async (event, data) => {
        try {
            const response = await axios.get(`${BASE_URL}/api/v1/files`, { params: data });
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to fetch files', { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
    
    // People endpoint
    ipcMain.handle('api:people', async (event, data) => {
        try {
            const response = await axios.get(`${BASE_URL}/api/v1/people`, { params: data });
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to fetch people', { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
    
    // Query endpoint
    ipcMain.handle('api:query', async (event, data) => {
        try {
            const response = await axios.post(`${BASE_URL}/api/v1/query`, data);
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to process query', { error: error.message }, 'api');
            }
            return { error: error.message };
        }
    });
}

/**
 * Set up event forwarding from main process to renderer
 * This ensures that events emitted in the main process are forwarded to the renderer
 */
function setupEventForwarding() {
    if (!eventService || !MonitoringService) {
        process.stderr.write(`[IPC] Cannot set up event forwarding: services not available\n`);
        return;
    }
    
    // Import event types directly from monitoring service to ensure consistency
    const eventTypes = MonitoringService.getEventTypes ? MonitoringService.getEventTypes() : {
        ERROR: 'log:error',
        INFO: 'log:info',
        WARN: 'log:warn',
        DEBUG: 'log:debug',
        METRIC: 'log:metric',
        SYSTEM_MEMORY_WARNING: 'system:memory:warning',
        SYSTEM_EMERGENCY: 'system:emergency'
    };
    
    process.stdout.write(`[IPC DEBUG] Setting up event forwarding with event types: ${JSON.stringify(eventTypes)}\n`);
    
    // Forward error events to renderer
    eventService.subscribe(eventTypes.ERROR, async (data) => {
        process.stdout.write(`[IPC DEBUG] Received ERROR event from eventService: ${JSON.stringify(data)}\n`);
        forwardEventToRenderer('monitoring:error:event', data);
    });
    
    // Forward info events to renderer
    eventService.subscribe(eventTypes.INFO, async (data) => {
        forwardEventToRenderer('monitoring:info:event', data);
    });
    
    // Forward warning events to renderer
    eventService.subscribe(eventTypes.WARN, async (data) => {
        forwardEventToRenderer('monitoring:warn:event', data);
    });
    
    // Forward debug events to renderer
    eventService.subscribe(eventTypes.DEBUG, async (data) => {
        forwardEventToRenderer('monitoring:debug:event', data);
    });
    
    // Forward metric events to renderer
    eventService.subscribe(eventTypes.METRIC, async (data) => {
        forwardEventToRenderer('monitoring:metric:event', data);
    });
    
    // Forward system events to renderer
    eventService.subscribe(eventTypes.SYSTEM_MEMORY_WARNING, async (data) => {
        forwardEventToRenderer('system:memory:warning', data);
    });
    
    eventService.subscribe(eventTypes.SYSTEM_EMERGENCY, async (data) => {
        forwardEventToRenderer('system:emergency', data);
    });
    
    MonitoringService.info('Event forwarding to renderer set up successfully', {}, 'ipc');
}

/**
 * Forward an event to all renderer processes
 * @param {string} channel - IPC channel name
 * @param {Object} data - Event data
 */
function forwardEventToRenderer(channel, data) {
    try {
        // Get all browser windows
        const windows = BrowserWindow.getAllWindows();
        
        // Debug log to verify event forwarding
        process.stdout.write(`[IPC DEBUG] Forwarding event to renderer: ${channel} with data: ${JSON.stringify(data)}\n`);
        
        // Forward to each window
        windows.forEach(window => {
            if (!window.isDestroyed()) {
                window.webContents.send(channel, data);
            }
        });
        
        // Debug log to verify windows count
        process.stdout.write(`[IPC DEBUG] Forwarded event to ${windows.length} windows\n`);
    } catch (error) {
        process.stderr.write(`[IPC] Failed to forward event to renderer: ${error.message}\n`);
    }
}

module.exports = {
    initIpcHandlers
};
