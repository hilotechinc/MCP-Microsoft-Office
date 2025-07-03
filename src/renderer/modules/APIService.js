/**
 * @fileoverview API Service for MCP web application
 * Handles external API calls via HTTP
 */

// Import utilities  
import { UINotification } from '../ui-notification.js';
import IPCService from '../services/IPCService.js';

export class APIService {
    constructor() {
        this.initialized = false;
        this.baseEndpoints = {
            status: '/api/status',
            logs: '/api/v1/logs',
            mail: '/api/v1/mail',
            calendar: '/api/v1/calendar',
            files: '/api/v1/files'
        };
    }

    /**
     * Initialize API Service
     */
    async init() {
        if (this.initialized) return;
        
        try {
            window.MonitoringService && window.MonitoringService.info('Initializing API Service', { operation: 'api-init' }, 'web');
            
            // Web-only version - no IPC available
            this.ipcAvailable = false;
            
            this.initialized = true;
            window.MonitoringService && window.MonitoringService.info('API Service initialized successfully', { 
                ipcAvailable: false,
                operation: 'api-init-complete'
            }, 'web');
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Failed to initialize API Service', {
                error: error.message,
                stack: error.stack,
                operation: 'api-init'
            }, 'web');
            throw error;
        }
    }

    /**
     * Check if IPC is available - always returns false in web-only version
     * @returns {boolean} Whether IPC is available (always false)
     */
    checkIPC() {
        return false;
    }

    /**
     * Make IPC call - always throws error in web-only version to force HTTP fallback
     * @param {string} channel - IPC channel
     * @param {any} data - Data to send
     * @returns {Promise<any>} Response from main process
     */
    async ipcCall(channel, data = null) {
        // In web-only version, always throw an error to force HTTP fallback
        throw new Error('IPC not available in web-only version');
    }

    /**
     * Fetch status from API
     * @returns {Promise<Object>} Status data
     */
    async fetchStatus() {
        const startTime = Date.now();
        
        try {
            window.MonitoringService && window.MonitoringService.info('Fetching status', { operation: 'status-fetch' }, 'renderer');
            
            let status;
            
            // Try IPC first if available, but fallback to HTTP on any failure
            if (this.ipcAvailable) {
                try {
                    status = await this.ipcCall('api:status');
                } catch (ipcError) {
                    window.MonitoringService && window.MonitoringService.warn('IPC failed, falling back to HTTP', {
                        error: ipcError.message,
                        operation: 'status-fetch-ipc-fallback'
                    }, 'renderer');
                    
                    // Fallback to HTTP
                    const response = await fetch(this.baseEndpoints.status);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    status = await response.json();
                }
            } else {
                // Direct API call
                const response = await fetch(this.baseEndpoints.status);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                status = await response.json();
            }
            
            const executionTime = Date.now() - startTime;
            window.MonitoringService && window.MonitoringService.trackMetric('status_fetch_success', executionTime, {
                method: this.ipcAvailable ? 'ipc' : 'http',
                timestamp: new Date().toISOString()
            });
            
            return status;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            window.MonitoringService && window.MonitoringService.trackMetric('status_fetch_failure', executionTime, {
                method: this.ipcAvailable ? 'ipc' : 'http',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            window.MonitoringService && window.MonitoringService.error('Failed to fetch status', {
                error: error.message,
                operation: 'status-fetch'
            }, 'renderer');
            
            throw error;
        }
    }

    /**
     * Fetch logs from API
     * @param {Object} options - Fetch options
     * @param {string} [options.scope='user'] - Whether to fetch 'user' or 'global' logs
     * @returns {Promise<Array>} Logs data
     */
    async fetchLogs(options = {}) {
        const startTime = Date.now();
        
        try {
            // Default to user-specific logs unless explicitly set otherwise
            if (!options.scope) {
                options.scope = 'user';
            }

            window.MonitoringService && window.MonitoringService.info('Fetching logs', { 
                options: this.redactSensitiveData(options),
                operation: 'logs-fetch'
            }, 'renderer');
            
            let logs;
            if (this.ipcAvailable) {
                logs = await this.ipcCall('api:logs', options);
            } else {
                // Fallback to direct API call
                const url = new URL(this.baseEndpoints.logs, window.location.origin);
                Object.entries(options).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        url.searchParams.append(key, value);
                    }
                });
                
                // Add headers for authentication and auto-refresh identification
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                // Mark as auto-refresh if that's what it is
                if (options.autoRefresh) {
                    headers['X-Requested-By'] = 'auto-refresh';
                }
                
                const response = await fetch(url, {
                    headers,
                    credentials: 'include' // Include cookies for authentication
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                logs = await response.json();
            }
            
            const executionTime = Date.now() - startTime;
            window.MonitoringService && window.MonitoringService.trackMetric('logs_fetch_success', executionTime, {
                method: this.ipcAvailable ? 'ipc' : 'http',
                logCount: Array.isArray(logs) ? logs.length : 0,
                scope: options.scope,
                timestamp: new Date().toISOString()
            });
            
            return logs;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            window.MonitoringService && window.MonitoringService.trackMetric('logs_fetch_failure', executionTime, {
                method: this.ipcAvailable ? 'ipc' : 'http',
                error: error.message,
                scope: options.scope,
                timestamp: new Date().toISOString()
            });
            
            window.MonitoringService && window.MonitoringService.error('Failed to fetch logs', {
                error: error.message,
                options: this.redactSensitiveData(options),
                operation: 'logs-fetch'
            }, 'renderer');
            
            throw error;
        }
    }

    /**
     * Test API connection
     * @param {string} api - API to test ('mail', 'calendar', 'files')
     * @param {Object} data - Test data
     * @returns {Promise<Object>} Test result
     */
    async testAPI(api, data = {}) {
        const startTime = Date.now();
        
        try {
            window.MonitoringService && window.MonitoringService.info('Testing API connection', { 
                api,
                operation: 'api-test'
            }, 'renderer');
            
            let result;
            if (this.ipcAvailable) {
                result = await this.ipcCall(`api:${api}`, data);
            } else {
                // Fallback to direct API call
                const response = await fetch(`${this.baseEndpoints[api]}/test`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                result = await response.json();
            }
            
            const executionTime = Date.now() - startTime;
            window.MonitoringService && window.MonitoringService.trackMetric('api_test_success', executionTime, {
                api,
                method: this.ipcAvailable ? 'ipc' : 'http',
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            window.MonitoringService && window.MonitoringService.trackMetric('api_test_failure', executionTime, {
                api,
                method: this.ipcAvailable ? 'ipc' : 'http',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            window.MonitoringService && window.MonitoringService.error('API test failed', {
                api,
                error: error.message,
                operation: 'api-test'
            }, 'renderer');
            
            throw error;
        }
    }

    /**
     * Clear logs
     * @returns {Promise<Object>} Clear result
     */
    async clearLogs() {
        try {
            window.MonitoringService && window.MonitoringService.info('Clearing logs', { operation: 'logs-clear' }, 'renderer');
            
            let result;
            if (this.ipcAvailable) {
                result = await this.ipcCall('api:logs', { action: 'clear' });
            } else {
                const response = await fetch(this.baseEndpoints.logs, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                result = await response.json();
            }
            
            window.MonitoringService && window.MonitoringService.info('Logs cleared successfully', { operation: 'logs-clear-complete' }, 'renderer');
            return result;
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Failed to clear logs', {
                error: error.message,
                operation: 'logs-clear'
            }, 'renderer');
            
            throw error;
        }
    }

    /**
     * Redact sensitive data for logging
     * @param {any} data - Data to redact
     * @returns {any} Redacted data
     */
    redactSensitiveData(data) {
        if (!data || typeof data !== 'object') return data;
        
        const redacted = Array.isArray(data) ? [...data] : { ...data };
        const sensitiveFields = ['password', 'token', 'email', 'auth', 'secret', 'key'];
        
        const redactObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            
            Object.keys(obj).forEach(key => {
                if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = 'REDACTED';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    redactObject(obj[key]);
                }
            });
        };
        
        redactObject(redacted);
        return redacted;
    }

    /**
     * Get API health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        try {
            const status = await this.fetchStatus();
            return {
                healthy: true,
                services: status.services || {},
                ipc: this.ipcAvailable,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                ipc: this.ipcAvailable,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Cleanup API Service resources
     */
    destroy() {
        this.initialized = false;
        window.MonitoringService && window.MonitoringService.info('API Service destroyed', { operation: 'api-cleanup' }, 'renderer');
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.APIService = APIService;
}