/**
 * @fileoverview Centralized IPC communication service for renderer process
 * Provides consistent error handling and performance tracking
 */

import { UINotification } from '../ui-notification.js';

/**
 * Service for handling IPC communication with proper error handling and metrics
 */
export class IPCService {
    static instance = null;
    
    constructor() {
        if (IPCService.instance) {
            return IPCService.instance;
        }
        
        this.isAvailable = this.checkAvailability();
        this.metrics = new Map();
        this.errorCount = 0;
        this.successCount = 0;
        
        IPCService.instance = this;
    }

    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!IPCService.instance) {
            IPCService.instance = new IPCService();
        }
        return IPCService.instance;
    }

    /**
     * Check if IPC is available
     */
    checkAvailability() {
        return !!(window.electron?.ipcRenderer?.invoke || window.electron?.ipcRenderer?.send);
    }

    /**
     * Send IPC message with proper error handling and metrics
     * @param {string} channel - IPC channel name
     * @param {*} data - Data to send
     * @returns {Promise<*>} Response from main process
     */
    async send(channel, data = null) {
        const startTime = performance.now();
        const context = {
            channel,
            hasData: data !== null,
            timestamp: new Date().toISOString()
        };

        try {
            if (!this.isAvailable) {
                throw new Error('IPC not available - running outside Electron context');
            }

            // Redact sensitive data for logging
            const redactedData = this.redactSensitiveData(data);
            
            // Send IPC message - check if invoke is available, fallback to send
            let result;
            if (window.electron.ipcRenderer.invoke) {
                result = await window.electron.ipcRenderer.invoke(channel, data);
            } else if (window.electron.ipcRenderer.send) {
                // Fallback to one-way send (no response expected)
                window.electron.ipcRenderer.send(channel, data);
                result = { success: true, method: 'send' };
            } else {
                throw new Error('No IPC communication method available');
            }
            
            // Track success metrics
            const executionTime = performance.now() - startTime;
            this.trackSuccess(channel, executionTime, context);
            
            return result;
        } catch (error) {
            // Track failure metrics
            const executionTime = performance.now() - startTime;
            this.trackFailure(channel, error, executionTime, context);
            
            // Create structured error
            const ipcError = this.createIPCError(error, channel, data);
            
            // Log error using MonitoringService if available
            if (window.MonitoringService) {
                window.MonitoringService.logError(ipcError);
            }
            
            throw ipcError;
        }
    }

    /**
     * Send one-way message (fire and forget)
     * @param {string} channel - IPC channel name
     * @param {*} data - Data to send
     */
    sendSync(channel, data = null) {
        const context = {
            channel,
            hasData: data !== null,
            type: 'sync',
            timestamp: new Date().toISOString()
        };

        try {
            if (!this.isAvailable) {
                if (window.MonitoringService) {
                    window.MonitoringService.warn('IPC sync send failed - not available', context, 'renderer');
                }
                return false;
            }

            window.electron.ipcRenderer.send(channel, data);
            
            if (window.MonitoringService) {
                window.MonitoringService.info('IPC sync message sent', context, 'renderer');
            }
            
            return true;
        } catch (error) {
            if (window.MonitoringService) {
                window.MonitoringService.error('IPC sync send failed', {
                    ...context,
                    error: error.message
                }, 'renderer');
            }
            return false;
        }
    }

    /**
     * Setup IPC event listener
     * @param {string} channel - Channel to listen on
     * @param {Function} callback - Callback function
     */
    on(channel, callback) {
        if (!this.isAvailable) {
            if (window.MonitoringService) {
                window.MonitoringService.warn('Cannot setup IPC listener - not available', {
                    channel,
                    timestamp: new Date().toISOString()
                }, 'renderer');
            }
            return () => {}; // Return no-op unsubscribe function
        }

        try {
            window.electron.ipcRenderer.on(channel, callback);
            
            if (window.MonitoringService) {
                window.MonitoringService.info('IPC listener registered', {
                    channel,
                    timestamp: new Date().toISOString()
                }, 'renderer');
            }
            
            // Return unsubscribe function
            return () => {
                window.electron.ipcRenderer.removeListener(channel, callback);
            };
        } catch (error) {
            if (window.MonitoringService) {
                window.MonitoringService.error('Failed to setup IPC listener', {
                    channel,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'renderer');
            }
            return () => {}; // Return no-op unsubscribe function
        }
    }

    /**
     * Remove IPC event listener
     * @param {string} channel - Channel name
     * @param {Function} callback - Callback function to remove
     */
    off(channel, callback) {
        if (!this.isAvailable) return;

        try {
            window.electron.ipcRenderer.removeListener(channel, callback);
            
            if (window.MonitoringService) {
                window.MonitoringService.info('IPC listener removed', {
                    channel,
                    timestamp: new Date().toISOString()
                }, 'renderer');
            }
        } catch (error) {
            if (window.MonitoringService) {
                window.MonitoringService.error('Failed to remove IPC listener', {
                    channel,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'renderer');
            }
        }
    }

    /**
     * Track successful IPC call
     */
    trackSuccess(channel, executionTime, context) {
        this.successCount++;
        
        // Track performance metrics
        if (window.MonitoringService?.trackMetric) {
            window.MonitoringService.trackMetric('ipc_call_success', executionTime, {
                ...context,
                totalCalls: this.successCount + this.errorCount
            });
        }
        
        // Update channel-specific metrics
        if (!this.metrics.has(channel)) {
            this.metrics.set(channel, { successes: 0, failures: 0, totalTime: 0 });
        }
        
        const channelMetrics = this.metrics.get(channel);
        channelMetrics.successes++;
        channelMetrics.totalTime += executionTime;
        
        if (window.MonitoringService?.info) {
            window.MonitoringService.info('IPC call successful', {
                ...context,
                executionTime,
                channelSuccesses: channelMetrics.successes,
                avgTime: channelMetrics.totalTime / channelMetrics.successes
            }, 'renderer');
        }
    }

    /**
     * Track failed IPC call
     */
    trackFailure(channel, error, executionTime, context) {
        this.errorCount++;
        
        // Track failure metrics
        if (window.MonitoringService?.trackMetric) {
            window.MonitoringService.trackMetric('ipc_call_failure', executionTime, {
                ...context,
                error: error.message,
                totalCalls: this.successCount + this.errorCount
            });
        }
        
        // Update channel-specific metrics
        if (!this.metrics.has(channel)) {
            this.metrics.set(channel, { successes: 0, failures: 0, totalTime: 0 });
        }
        
        const channelMetrics = this.metrics.get(channel);
        channelMetrics.failures++;
        
        if (window.MonitoringService?.error) {
            window.MonitoringService.error('IPC call failed', {
                ...context,
                error: error.message,
                executionTime,
                channelFailures: channelMetrics.failures
            }, 'renderer');
        }
    }

    /**
     * Create standardized IPC error
     */
    createIPCError(originalError, channel, data) {
        if (window.ErrorService?.createError) {
            return window.ErrorService.createError(
                'system',
                `IPC call failed: ${originalError.message}`,
                'error',
                {
                    channel,
                    data: this.redactSensitiveData(data),
                    originalError: originalError.message,
                    stack: originalError.stack,
                    timestamp: new Date().toISOString()
                }
            );
        }
        
        // Fallback error structure
        return {
            category: 'system',
            message: `IPC call failed: ${originalError.message}`,
            severity: 'error',
            context: {
                channel,
                data: this.redactSensitiveData(data),
                originalError: originalError.message,
                timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Redact sensitive data for logging
     * @param {*} data - Data to redact
     * @returns {*} Redacted data
     */
    redactSensitiveData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        const redacted = Array.isArray(data) ? [...data] : { ...data };
        const sensitiveFields = [
            'password', 'token', 'accessToken', 'refreshToken', 
            'email', 'auth', 'authorization', 'secret', 
            'key', 'credential', 'bearer'
        ];
        
        // Recursively redact sensitive fields
        const redactObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            
            if (Array.isArray(obj)) {
                return obj.map(item => redactObject(item));
            }
            
            const result = { ...obj };
            Object.keys(result).forEach(key => {
                const lowerKey = key.toLowerCase();
                
                // Check if field name contains sensitive keywords
                if (sensitiveFields.some(field => lowerKey.includes(field))) {
                    result[key] = 'REDACTED';
                } else if (typeof result[key] === 'object') {
                    result[key] = redactObject(result[key]);
                }
            });
            
            return result;
        };
        
        return redactObject(redacted);
    }

    /**
     * Get IPC service statistics
     * @returns {Object} Service statistics
     */
    getStats() {
        const channelStats = {};
        this.metrics.forEach((stats, channel) => {
            channelStats[channel] = {
                ...stats,
                successRate: stats.successes / (stats.successes + stats.failures) * 100,
                avgTime: stats.totalTime / stats.successes || 0
            };
        });
        
        return {
            totalCalls: this.successCount + this.errorCount,
            successCount: this.successCount,
            errorCount: this.errorCount,
            successRate: this.successCount / (this.successCount + this.errorCount) * 100 || 0,
            isAvailable: this.isAvailable,
            channels: channelStats
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.metrics.clear();
        this.errorCount = 0;
        this.successCount = 0;
        
        if (window.MonitoringService?.info) {
            window.MonitoringService.info('IPC service statistics reset', {
                timestamp: new Date().toISOString()
            }, 'renderer');
        }
    }

    // Convenience methods for common IPC patterns

    /**
     * Send monitoring log to main process
     */
    async sendLog(level, message, metadata, category) {
        return this.sendSync(`monitoring:${level}`, {
            message,
            metadata,
            category,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Send error to main process
     */
    async sendError(error) {
        return this.sendSync('monitoring:logError', {
            error,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track metric via main process
     */
    async trackMetric(name, value, metadata) {
        return this.sendSync('monitoring:trackMetric', {
            name,
            value,
            metadata,
            timestamp: new Date().toISOString()
        });
    }
}

// Export singleton instance
export default IPCService.getInstance();