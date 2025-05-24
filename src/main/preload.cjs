// @fileoverview Preload script for Electron contextBridge/IPCs (stub for now)
// Extend with contextBridge, ipcRenderer as needed for secure IPC

/**
 * @fileoverview Electron preload script: exposes secure, whitelisted APIs to renderer.
 * Only exposes explicitly defined async methods using contextBridge.
 * All communication is via validated, async IPC.
 */
const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure API exposed to renderer.
 * @namespace window.api
 */
const api = {
    /**
     * Example: Send a query to main process (stub, extend as needed)
     * @param {string} query
     * @returns {Promise<any>} Response from main process
     */
    sendQuery: async (query) => ipcRenderer.invoke('send-query', query),

    /**
     * Example: Ping main process
     * @returns {Promise<string>}
     */
    ping: async () => ipcRenderer.invoke('ping')
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', api);

// Expose IPC renderer for monitoring and error services
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        // Expose only the specific IPC channels we need
        send: (channel, data) => {
            // Whitelist channels for security
            const validChannels = [
                'monitoring:info',
                'monitoring:warn',
                'monitoring:error',
                'monitoring:logError',
                'monitoring:trackMetric',
                'error:create',
                'services:load'
            ];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        // Expose invoke for API calls
        invoke: (channel, data) => {
            const validChannels = [
                'api:status',
                'api:logs',
                'api:mail',
                'api:calendar',
                'api:files',
                'api:people',
                'api:query'
            ];
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, data);
            }
            return Promise.reject(new Error(`Invalid channel: ${channel}`));
        },
        // For receiving responses from the main process
        on: (channel, func) => {
            const validChannels = ['services:loaded'];
            if (validChannels.includes(channel)) {
                // Strip event as it includes `sender` which exposes IPC objects
                const subscription = (event, ...args) => func(...args);
                ipcRenderer.on(channel, subscription);
                return () => {
                    ipcRenderer.removeListener(channel, subscription);
                };
            }
        }
    }
});

