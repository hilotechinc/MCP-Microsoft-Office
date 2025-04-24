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

contextBridge.exposeInMainWorld('api', api);

