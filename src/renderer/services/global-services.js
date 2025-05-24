/**
 * @fileoverview Global service definitions for renderer process
 * Provides MonitoringService and ErrorService with IPC fallback
 */

/**
 * Global MonitoringService with IPC fallback
 */
window.MonitoringService = {
    info: (message, metadata, category) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:info', { message, metadata, category });
            return true;
        }
        console.info(`[${category || 'renderer'}] ${message}`, metadata || {});
        return false;
    },
    warn: (message, metadata, category) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:warn', { message, metadata, category });
            return true;
        }
        console.warn(`[${category || 'renderer'}] ${message}`, metadata || {});
        return false;
    },
    error: (message, metadata, category) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:error', { message, metadata, category });
            return true;
        }
        console.error(`[${category || 'renderer'}] ${message}`, metadata || {});
        return false;
    },
    logError: (error) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:logError', { error });
            return true;
        }
        console.error('[error]', error);
        return false;
    },
    trackMetric: (name, value, metadata) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:trackMetric', { name, value, metadata });
            return true;
        }
        console.log(`[metric] ${name}: ${value}`, metadata || {});
        return false;
    }
};

/**
 * Global ErrorService with standardized error creation
 */
window.ErrorService = {
    createError: (category, message, severity, context) => {
        // Create error locally but send via IPC for logging
        const error = {
            category,
            message,
            severity,
            context,
            timestamp: new Date().toISOString()
        };
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('error:create', error);
        }
        return error;
    }
};

// Notify that global services are loaded
if (window.MonitoringService) {
    window.MonitoringService.info('Global services initialized', {
        ipcAvailable: !!(window.electron?.ipcRenderer),
        timestamp: new Date().toISOString()
    }, 'renderer');
}