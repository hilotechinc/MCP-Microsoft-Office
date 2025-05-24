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
        
        if (MonitoringService) {
            MonitoringService.info('Monitoring and Error services loaded successfully', {}, 'ipc');
        }
        
        // Set up IPC handlers for monitoring service
        setupMonitoringHandlers();
        
        // Set up IPC handlers for error service
        setupErrorHandlers();
        
        // Set up API handlers
        setupAPIHandlers();
        
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
 * Set up IPC handlers for the monitoring service
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
    ipcMain.handle('api:logs', async () => {
        try {
            const response = await axios.get(`${BASE_URL}/api/v1/logs`);
            return response.data;
        } catch (error) {
            if (MonitoringService) {
                MonitoringService.error('Failed to fetch logs', { error: error.message }, 'api');
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

module.exports = {
    initIpcHandlers
};
